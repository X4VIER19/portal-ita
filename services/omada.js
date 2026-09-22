const axios = require("axios");
const https = require("https");

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

// Evita que varias llamadas simultáneas hagan refresh al mismo tiempo.
let refreshPromise = null;

const UNAUTH_CODES_EQUIVALENTES_A_EXITO = new Set([
    -41006,
    -41019
]);

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
    const mensaje = [
        data?.msg,
        data?.message
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return mensaje.includes("access token has expired")
        || mensaje.includes("token has expired")
        || mensaje.includes("token expired");
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

        console.log(
            "Token obtenido correctamente. Expira en",
            expiresIn,
            "segundos."
        );

        return tokenState.accessToken;

    } catch (error) {
        console.log("ERROR AL OBTENER TOKEN");

        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }

        throw error;
    }
}

async function refrescarToken() {
    // Si ya existe un refresh en curso, reutilizarlo.
    if (refreshPromise) {
        console.log(
            "Refresh de token ya en curso. Esperando resultado..."
        );

        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            console.log("Intentando REFRESH TOKEN...");
            console.log(
                "Refresh token disponible:",
                !!tokenState.refreshToken
            );

            if (!tokenState.refreshToken) {
                console.log(
                    "No existe refreshToken. Se solicitará un token nuevo."
                );

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

            console.log(
                "Token refrescado correctamente. Expira en",
                expiresIn,
                "segundos."
            );

            return tokenState.accessToken;

        } catch (error) {
            console.log(
                "ERROR AL REFRESCAR TOKEN"
            );

            if (error.response) {
                console.log(
                    "HTTP:",
                    error.response.status
                );

                console.log(
                    "Respuesta Omada:",
                    error.response.data
                );
            } else {
                console.log(
                    "Error:",
                    error.message
                );
            }

            console.log(
                "Se intentará obtener un token nuevo mediante Client Credentials."
            );

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
        console.log(
            "AccessToken considerado expirado localmente."
        );

        return refrescarToken();
    }

    return tokenState.accessToken;
}

async function ejecutarConToken(callback) {
    let token = await getValidToken();

    let response = await callback(token);

    if (
        response?.data &&
        esTokenExpiradoRespuesta(response.data)
    ) {
        console.log(
            "Omada rechazó el AccessToken porque está expirado."
        );

        console.log(
            "Intentando refrescar token y repetir la operación una sola vez..."
        );

        token = await refrescarToken();

        response = await callback(token);
    }

    return response;
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

        console.log(response.data);
        return response.data;

    } catch (error) {
        console.log("ERROR API SITES");

        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }

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

        console.log(
            `AUTH -> ${clientMac}:`,
            response.data
        );

        return response.data;

    } catch (error) {
        console.log(
            `ERROR AL AUTORIZAR ${clientMac}`
        );

        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
            return error.response.data;
        } else {
            console.log(error.message);
            throw error;
        }
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

        console.log(
            `UNAUTH -> ${clientMac}:`,
            response.data
        );

        return response.data;

    } catch (error) {
        console.log(
            `ERROR AL DESAUTORIZAR ${clientMac}`
        );

        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
            return error.response.data;
        } else {
            console.log(error.message);
            throw error;
        }
    }
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
        console.log(
            "ERROR AL LISTAR AUTHED-RECORDS"
        );

        if (error.response) {
            console.log(error.response.status);
            console.log(error.response.data);
        } else {
            console.log(error.message);
        }

        throw error;
    }
}

module.exports = {
    testAPI,
    getValidToken,
    authClient,
    unauthClient,
    listarAuthedRecords,
    unauthEfectivo
};