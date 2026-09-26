const axios = require("axios");
const https = require("https");
const logger = require("../utils/logger");

const client = axios.create({
    baseURL: process.env.OMADA_URL,
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

let tokenState = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0
};

// Evita múltiples refresh simultáneos.
let refreshPromise = null;

const UNAUTH_CODES_EQUIVALENTES_A_EXITO = new Set([
    -41006,
    -41019
]);

function contextoErrorOmada(error, contexto = {}) {
    return {
        ...contexto,
        errorName: error?.name,
        errorMessage: error?.message,
        errorCode: error?.code,
        httpStatus: error?.response?.status,
        omadaErrorCode: error?.response?.data?.errorCode
    };
}

function unauthEfectivo(respuesta) {
    if (!respuesta || typeof respuesta.errorCode !== "number") {
        return false;
    }

    return respuesta.errorCode === 0
        || UNAUTH_CODES_EQUIVALENTES_A_EXITO.has(respuesta.errorCode);
}

function esTokenExpirado(error) {
    const mensaje = [
        error?.message,
        error?.response?.data?.msg,
        error?.response?.data?.message
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return mensaje.includes("access token has expired")
        || mensaje.includes("token has expired")
        || mensaje.includes("token expired");
}

function esTokenExpiradoRespuesta(data) {
    return esTokenExpirado({
        response: {
            data
        }
    });
}

async function obtenerToken() {
    try {
        const response = await client.post(
            "/openapi/authorize/token",
            {
                omadacId: process.env.OMADA_OMADAC_ID,
                client_id: process.env.OMADA_CLIENT_ID,
                client_secret: process.env.OMADA_CLIENT_SECRET
            },
            {
                params: {
                    grant_type: "client_credentials"
                },
                headers: {
                    "content-type": "application/json"
                }
            }
        );

        if (response.data.errorCode !== 0) {
            throw new Error(
                `Omada error: ${response.data.msg}`
            );
        }

        const {
            accessToken,
            refreshToken,
            expiresIn
        } = response.data.result;

        tokenState = {
            accessToken,
            refreshToken,
            expiresAt: Date.now() + (expiresIn - 60) * 1000
        };

        logger.info("omada.token.obtained", { expiresInSeconds: expiresIn });

        return tokenState.accessToken;

    } catch (error) {
        logger.error("omada.token.obtain_failed", contextoErrorOmada(error));

        throw error;
    }
}

async function refrescarToken() {
    if (refreshPromise) {
        logger.debug("omada.token.refresh_already_running");

        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            logger.debug("omada.token.refresh_started", {
                refreshTokenAvailable: Boolean(tokenState.refreshToken)
            });

            if (!tokenState.refreshToken) {
                logger.info("omada.token.refresh_unavailable");

                return await obtenerToken();
            }

            const response = await client.post(
                "/openapi/authorize/token",
                {
                    client_id: process.env.OMADA_CLIENT_ID,
                    client_secret: process.env.OMADA_CLIENT_SECRET
                },
                {
                    params: {
                        grant_type: "refresh_token",
                        refresh_token: tokenState.refreshToken
                    },
                    headers: {
                        "content-type": "application/json"
                    }
                }
            );

            if (response.data.errorCode !== 0) {
                throw new Error(
                    `Omada error: ${response.data.msg}`
                );
            }

            const {
                accessToken,
                refreshToken,
                expiresIn
            } = response.data.result;

            tokenState = {
                accessToken,
                refreshToken,
                expiresAt: Date.now() + (expiresIn - 60) * 1000
            };

            logger.info("omada.token.refreshed", { expiresInSeconds: expiresIn });

            return tokenState.accessToken;

        } catch (error) {
            logger.warn("omada.token.refresh_failed", contextoErrorOmada(error, {
                fallback: "client_credentials"
            }));

            return await obtenerToken();

        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

async function getValidToken() {
    if (!tokenState.accessToken) {
        return obtenerToken();
    }

    if (Date.now() >= tokenState.expiresAt) {
        logger.debug("omada.token.expired_locally");

        return refrescarToken();
    }

    return tokenState.accessToken;
}

async function ejecutarConToken(callback) {
    let token = await getValidToken();

    try {
        let response = await callback(token);

        if (
            response?.data &&
            esTokenExpiradoRespuesta(response.data)
        ) {
            throw new Error(
                response.data.msg || "Access token expirado."
            );
        }

        return response;

    } catch (error) {
        if (!esTokenExpirado(error)) {
            throw error;
        }

        logger.warn("omada.token.rejected_as_expired", { retry: true });

        token = await refrescarToken();

        return await callback(token);
    }
}

async function obtenerInfoCliente(clientMac) {
    try {
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await ejecutarConToken(async (token) => {
            return client.get(
                `/openapi/v1/${omadacId}/sites/${siteId}/clients/${clientMac}`,
                {
                    headers: {
                        "Authorization": `AccessToken=${token}`
                    }
                }
            );
        });

        return response.data;

    } catch (error) {
        if (error.response) {
            logger.warn("omada.client_info.rejected", contextoErrorOmada(error, {
                clientMac
            }));
            return error.response.data;
        }

        logger.error("omada.client_info.failed", contextoErrorOmada(error, {
            clientMac
        }));
        throw error;
    }
}

/*
 * ============================================================
 * NUEVO: resolución del SSID de origen de un cliente.
 * ============================================================
 * Basado en la prueba diagnóstica (scripts/test-ssid-preauth.js):
 * el campo `result.ssid` de obtenerInfoCliente() ya está disponible
 * mientras el cliente está PENDING (antes de cualquier login/AUTH),
 * así que no es necesario esperar a que el usuario se autentique.
 *
 * Se incluye un reintento corto para cubrir el caso borde en el que,
 * en el instante exacto de la consulta, el cliente momentáneamente
 * no reporta info (ej. roaming entre APs, reconexión).
 *
 * No decide nada de negocio aquí (no valida contra ssids_portal ni
 * contra el rol del usuario): solo devuelve el nombre del SSID o
 * null si no se pudo determinar tras los reintentos.
 */
async function obtenerSsidCliente(clientMac, intentos = 2, esperaMs = 1500) {
    for (let intento = 1; intento <= intentos; intento++) {
        let info;

        try {
            info = await obtenerInfoCliente(clientMac);
        } catch (error) {
            logger.debug("omada.ssid_lookup.attempt_failed", contextoErrorOmada(error, {
                clientMac,
                attempt: intento,
                maxAttempts: intentos
            }));
            info = null;
        }

        const ssid = info?.result?.ssid;

        if (ssid) {
            return ssid;
        }

        if (intento < intentos) {
            await new Promise((resolve) => setTimeout(resolve, esperaMs));
        }
    }

    logger.warn("omada.ssid_lookup.not_found", {
        clientMac,
        attempts: intentos
    });

    return null;
}

async function testAPI() {
    try {
        const response = await ejecutarConToken(async (token) => {
            return client.get(
                `/openapi/v1/${process.env.OMADA_OMADAC_ID}/sites`,
                {
                    params: {
                        pageSize: 10,
                        page: 1
                    },
                    headers: {
                        "content-type": "application/json",
                        "Authorization": `AccessToken=${token}`
                    }
                }
            );
        });

        logger.debug("omada.sites.listed", {
            errorCode: response.data?.errorCode,
            resultCount: response.data?.result?.data?.length
        });
        return response.data;

    } catch (error) {
        logger.error("omada.sites.list_failed", contextoErrorOmada(error));

        throw error;
    }
}

async function authClient(clientMac) {
    try {
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await ejecutarConToken(async (token) => {
            return client.post(
                `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${clientMac}/auth`,
                null,
                {
                    headers: {
                        "Authorization": `AccessToken=${token}`
                    }
                }
            );
        });

        const registrarResultado = response.data?.errorCode === 0
            ? logger.info
            : logger.warn;
        registrarResultado("omada.client.auth_result", {
            clientMac,
            omadaErrorCode: response.data?.errorCode
        });

        return response.data;

    } catch (error) {
        if (error.response) {
            logger.warn("omada.client.auth_rejected", contextoErrorOmada(error, {
                clientMac
            }));
            return error.response.data;
        }

        logger.error("omada.client.auth_failed", contextoErrorOmada(error, {
            clientMac
        }));
        throw error;
    }
}

async function unauthClient(clientMac) {
    try {
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await ejecutarConToken(async (token) => {
            return client.post(
                `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${clientMac}/unauth`,
                null,
                {
                    headers: {
                        "Authorization": `AccessToken=${token}`
                    }
                }
            );
        });

        const registrarResultado = unauthEfectivo(response.data)
            ? logger.info
            : logger.warn;
        registrarResultado("omada.client.unauth_result", {
            clientMac,
            omadaErrorCode: response.data?.errorCode
        });

        return response.data;

    } catch (error) {
        if (error.response) {
            logger.warn("omada.client.unauth_rejected", contextoErrorOmada(error, {
                clientMac
            }));
            return error.response.data;
        }

        logger.error("omada.client.unauth_failed", contextoErrorOmada(error, {
            clientMac
        }));
        throw error;
    }
}

/*
 * ============================================================
 * PRUEBAS - CAMBIO ATÓMICO DE SESIÓN EN OMADA
 * ============================================================
 */
async function cambiarSesionOmada(macAnterior, macNueva) {
    // FUNCIÓN DE PRUEBAS: no se usa todavía en el login normal.

    if (!macAnterior || !macNueva) {
        return {
            ok: false,
            etapa: "validacion",
            error: "Faltan MACs."
        };
    }

    if (macAnterior === macNueva) {
        return {
            ok: true,
            etapa: "misma_mac"
        };
    }

    logger.debug("omada.test_session_change.started", {
        previousMac: macAnterior,
        newMac: macNueva
    });

    // 1. Quitar autorización anterior
    let resultadoUnauth;

    try {
        resultadoUnauth = await unauthClient(macAnterior);
    } catch (error) {
        return {
            ok: false,
            etapa: "unauth_anterior",
            ambiguo: true,
            error: error.message
        };
    }

    if (!unauthEfectivo(resultadoUnauth)) {
        return {
            ok: false,
            etapa: "unauth_anterior",
            resultado: resultadoUnauth
        };
    }

    // 2. Autorizar nueva MAC
    let resultadoAuth;

    try {
        resultadoAuth = await authClient(macNueva);
    } catch (error) {
        return {
            ok: false,
            etapa: "auth_nueva",
            ambiguo: true,
            error: error.message
        };
    }

    // 3. Si Omada rechazó la nueva MAC, intentar restaurar la anterior
    if (resultadoAuth.errorCode !== 0) {
        logger.warn("omada.test_session_change.auth_failed", {
            newMac: macNueva,
            omadaErrorCode: resultadoAuth.errorCode,
            restorePrevious: true
        });

        let restauracion;

        try {
            restauracion = await authClient(macAnterior);
        } catch (error) {
            restauracion = {
                ok: false,
                ambiguo: true,
                error: error.message
            };
        }

        return {
            ok: false,
            etapa: "auth_nueva",
            resultado: resultadoAuth,
            restauracion
        };
    }

    return {
        ok: true,
        etapa: "completado",
        resultadoAuth
    };
}

async function listarAuthedRecords() {
    try {
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await ejecutarConToken(async (token) => {
            return client.get(
                `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/authed-records`,
                {
                    params: {
                        page: 1,
                        pageSize: 1000
                    },
                    headers: {
                        "Authorization": `AccessToken=${token}`
                    }
                }
            );
        });

        if (response.data.errorCode !== 0) {
            throw new Error(
                `Omada error: ${response.data.msg}`
            );
        }

        return response.data.result.data;

    } catch (error) {
        logger.error("omada.authed_records.list_failed", contextoErrorOmada(error));

        throw error;
    }
}

async function listarClientes() {
    try {
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await ejecutarConToken(async (token) => {
            return client.get(
                `/openapi/v1/${omadacId}/sites/${siteId}/clients`,
                {
                    params: {
                        page: 1,
                        pageSize: 1000
                    },
                    headers: {
                        "Authorization": `AccessToken=${token}`
                    }
                }
            );
        });

        if (response.data.errorCode !== 0) {
            throw new Error(
                `Omada error: ${response.data.msg}`
            );
        }

        return response.data.result.data;

    } catch (error) {
        logger.error("omada.clients.list_failed", contextoErrorOmada(error));

        throw error;
    }
}

module.exports = {
    testAPI,
    getValidToken,
    authClient,
    unauthClient,
    unauthEfectivo,
    listarAuthedRecords,
    cambiarSesionOmada,
    obtenerInfoCliente,
    obtenerSsidCliente,
    listarClientes
};
