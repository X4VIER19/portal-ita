require("dotenv").config();

const {
    authClient,
    unauthClient,
    obtenerInfoCliente
} = require("../services/omada");

function resumen(info) {
    if (!info || !info.result) {
        return { errorCode: info?.errorCode, msg: info?.msg };
    }

    const r = info.result;

    return {
        active: r.active,
        authStatus: r.authStatus,
        apMac: r.apMac,
        ssid: r.ssid,
        radioId: r.radioId,
        powerSave: r.powerSave,
        connectType: r.connectType,
        rssi: r.rssi,
        lastSeen: r.lastSeen,
        uptime: r.uptime
    };
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function paso(titulo, mac) {
    console.log(`\n${titulo}`);
    console.dir(resumen(await obtenerInfoCliente(mac)), { depth: null });
}

async function main() {
    const mac = process.argv[2];

    if (!mac) {
        console.log("Uso:");
        console.log("node scripts/test-diagnostico-cliente.js MAC");
        process.exit(1);
    }

    console.log("\n=== DIAGNÓSTICO UNAUTH -> AUTH (con info real del cliente) ===");
    console.log(`MAC: ${mac}`);

    await paso("0. Estado inicial:", mac);

    console.log("\n1. Ejecutando UNAUTH...");
    console.log("Resultado UNAUTH:", await unauthClient(mac));

    await paso("2. Estado inmediatamente después del UNAUTH:", mac);

    await esperar(2000);
    await paso("3. Estado tras ~2s:", mac);

    await esperar(8000);
    await paso("4. Estado tras ~10s:", mac);

    console.log("\n5. Ejecutando AUTH...");
    const resultadoAuth = await authClient(mac);
    console.log("Resultado AUTH:", resultadoAuth);

    await paso("6. Estado del cliente después del AUTH:", mac);

    console.log("\n=== FIN DEL DIAGNÓSTICO ===");
    console.log(
        "Revisa sobre todo: 'active' y 'authStatus' en los pasos 2, 3 y 4 " +
        "justo antes del AUTH del paso 5 (errorCode " + resultadoAuth?.errorCode + ")."
    );
}

main().catch(err => {
    console.error("\nERROR EN DIAGNÓSTICO:");
    console.error(err);
    process.exit(1);
});
