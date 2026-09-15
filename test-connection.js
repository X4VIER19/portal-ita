const axios = require("axios");
const https = require("https");

axios.get(
    "https://192.168.10.136:8043",
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