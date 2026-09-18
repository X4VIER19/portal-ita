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

// Códigos de error de Omada para el endpoint "unauth" que, en la práctica,
// equivalen a un éxito: no hay nada que desautorizar porque el cliente
// ya no existe en el controlador o ya está en proceso de ser desconectado.
// Fuente: documentación OpenAPI de Omada, endpoint
// POST /hotspot/clients/{clientMac}/unauth (sección "Authorized Client").
const UNAUTH_CODES_EQUIVALENTES_A_EXITO = new Set([
    -41006, // This client does not exist.
    -41019  // The client is being disconnected, please wait...
]);

// Determina si una respuesta de unauthClient() debe tratarse como éxito
// para efectos del flujo de negocio (aunque errorCode no sea 0).
function unauthEfectivo(respuesta) {
    if (!respuesta || typeof respuesta.errorCode !== "number") {
        return false;
    }

    return respuesta.errorCode === 0
        || UNAUTH_CODES_EQUIVALENTES_A_EXITO.has(respuesta.errorCode);
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
        return obtenerToken();
    }
}

async function getValidToken() {
    if (!tokenState.accessToken) {
        return obtenerToken();
    }
    if (Date.now() >= tokenState.expiresAt) {
        return refrescarToken();
    }
    return tokenState.accessToken;
}

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

async function authClient(clientMac) {
    try {
        const token = await getValidToken();
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await client.post(
            `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${clientMac}/auth`,
            null,
            { headers: { "Authorization": `AccessToken=${token}` } }
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

async function unauthClient(clientMac) {
    try {
        const token = await getValidToken();
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await client.post(
            `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/clients/${clientMac}/unauth`,
            null,
            { headers: { "Authorization": `AccessToken=${token}` } }
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

async function listarAuthedRecords() {
    try {
        const token = await getValidToken();
        const siteId = process.env.OMADA_SITE_ID;
        const omadacId = process.env.OMADA_OMADAC_ID;

        const response = await client.get(
            `/openapi/v1/${omadacId}/sites/${siteId}/hotspot/authed-records`,
            {
                // 1000 es el máximo permitido por la API para este endpoint.
                // Si algún día el total de registros supera 1000 en un solo
                // site, hará falta paginar (usar totalRows de la respuesta
                // para saber si se necesitan más páginas). Por ahora, con
                // el volumen de tu laboratorio, una sola página es suficiente.
                params: { page: 1, pageSize: 1000 },
                headers: { "Authorization": `AccessToken=${token}` }
            }
        );

        if (response.data.errorCode !== 0) {
            throw new Error(`Omada error: ${response.data.msg}`);
        }

        return response.data.result.data;
    } catch (error) {
        console.log("ERROR AL LISTAR AUTHED-RECORDS");
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
