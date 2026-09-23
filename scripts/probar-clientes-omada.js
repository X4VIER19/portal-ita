require("dotenv").config();

const {
    listarClientes
} = require("../services/omada");

async function main() {
    try {
        console.log("Consultando clientes de Omada...");

        const clientes = await listarClientes();

        const filtrados = clientes.filter(
            cliente =>
                cliente.wireless === true &&
                cliente.ssid === "Portal_Docentes_Prueba"
        );

        console.table(
            filtrados.map(cliente => ({
                mac: cliente.mac,
                ip: cliente.ip,
                ssid: cliente.ssid,
                authStatus: cliente.authStatus,
                active: cliente.active,
                lastSeen: cliente.lastSeen
            }))
        );

        console.log(
            `Clientes encontrados: ${filtrados.length}`
        );

    } catch (error) {
        console.error("ERROR:");
        console.error(error.message);
    }
}

main();