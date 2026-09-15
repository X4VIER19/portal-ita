const axios = require("axios");
const https = require("https");

const client = axios.create({
    baseURL: process.env.OMADA_URL,
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

// Estado del token en memoria (simple para laboratorio; en producción
// conviene persistirlo, ej. en un archivo o base de datos, para no
// perderlo si el proceso se reinicia).
let tokenState = {
    accessToken: null,
    refreshToken: null,
    expiresAt: 0 // timestamp en ms
};

/**
 * Obtiene un access token nuevo usando Client Credentials mode.
 */
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
                params: { grant_type: "client_credentials" },
                headers: { "content-type": "application/json" }
            }
        );

        if (response.data.errorCode !== 0) {
            throw new Error(`Omada error: ${response.data.msg}`);
        }

        const { accessToken, refreshToken, expiresIn } = response.data.result;

        tokenState = {
            accessToken,
            refreshToken,
            // Restamos 60s de margen para refrescar antes de que expire de verdad
            expiresAt: Date.now() + (expiresIn - 60) * 1000
        };

        console.log("Token obtenido correctamente. Expira en", expiresIn, "segundos.");
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

/**
 * Usa el refresh token para obtener un access token nuevo sin
 * volver a autenticar desde cero.
 */
async function refrescarToken() {
    try {
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
                headers: { "content-type": "application/json" }
            }
        );

        if (response.data.errorCode !== 0) {
            throw new Error(`Omada error: ${response.data.msg}`);
        }

        const { accessToken, refreshToken, expiresIn } = response.data.result;

        tokenState = {
            accessToken,
            refreshToken,
            expiresAt: Date.now() + (expiresIn - 60) * 1000
        };

        console.log("Token refrescado correctamente.");
        return tokenState.accessToken;

    } catch (error) {
        console.log("ERROR AL REFRESCAR TOKEN, intentando obtener uno nuevo desde cero");
        // Si el refresh token también expiró (14 días), hay que reautenticar
        return obtenerToken();
    }
}

/**
 * Devuelve un access token válido, obteniéndolo o refrescándolo
 * automáticamente según haga falta. Úsalo antes de cualquier
 * llamada a la API de Omada.
 */
async function getValidToken() {
    if (!tokenState.accessToken) {
        return obtenerToken();
    }
    if (Date.now() >= tokenState.expiresAt) {
        return refrescarToken();
    }
    return tokenState.accessToken;
}

/**
 * Prueba de conexión autenticada: pide el listado de sites,
 * que sí requiere token válido (a diferencia de /openapi/info).
 */
async function testAPI() {
    try {
        const token = await getValidToken();

        const response = await client.get(
            `/openapi/v1/${process.env.OMADA_OMADAC_ID}/sites`,
            {
                params: { pageSize: 10, page: 1 },
                headers: {
                    "content-type": "application/json",
                    "Authorization": `AccessToken=${token}`
                }
            }
        );

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
    }
}

/**
 * Autoriza a un cliente (le da internet) dado su MAC.
 * Formato esperado de mac: AA-BB-CC-DD-EE-FF (con guiones).
 */
async function authClient(clientMac) {
    try {
        const token = await getValidToken();
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await client.post(
            `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${clientMac}/auth`,
            null, // no requiere body
            {
                headers: {
                    "Authorization": `AccessToken=${token}`
                }
            }
        );

        console.log(`AUTH -> ${clientMac}:`, response.data);
        return response.data;

    } catch (error) {
        console.log(`ERROR AL AUTORIZAR ${clientMac}`);
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

/**
 * Desautoriza a un cliente (le quita internet) dado su MAC.
 */
async function unauthClient(clientMac) {
    try {
        const token = await getValidToken();
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await client.post(
            `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${clientMac}/unauth`,
            null,
            {
                headers: {
                    "Authorization": `AccessToken=${token}`
                }
            }
        );

        console.log(`UNAUTH -> ${clientMac}:`, response.data);
        return response.data;

    } catch (error) {
        console.log(`ERROR AL DESAUTORIZAR ${clientMac}`);
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

module.exports = {
    testAPI,
    getValidToken,
    authClient,
    unauthClient
};