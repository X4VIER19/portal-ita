const axios = require("axios");
const https = require("https");

axios.get(
    OMADA_URL,
    {
        httpsAgent: new https.Agent({
            rejectUnauthorized: false
        }),
        timeout: 5000
    }
)
    .then(response => {

        console.log("CONEXIÓN EXITOSA");
        console.log("STATUS:", response.status);

    })
    .catch(error => {

        console.log("ERROR:");
        console.log(error.message);

    });