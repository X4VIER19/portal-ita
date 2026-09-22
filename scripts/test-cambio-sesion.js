require("dotenv").config();

const {
    authClient,
    unauthClient
} = require("../services/omada");

async function main() {
    const mac = process.argv[2];

    if (!mac) {
        console.log("Uso:");
        console.log("node scripts/test-cambio-sesion.js MAC");
        process.exit(1);
    }

    console.log("\n=== PRUEBA UNAUTH -> ESPERA -> AUTH ===");
    console.log(`MAC: ${mac}`);
    console.log("");

    try {
        // 1. UNAUTH
        console.log("1. Ejecutando UNAUTH...");

        const resultadoUnauth = await unauthClient(mac);

        console.log("Resultado UNAUTH:");
        console.dir(resultadoUnauth, { depth: null });

        // 2. Esperar 10 segundos
        console.log("\n2. Esperando 10 segundos...");

        await new Promise(resolve => setTimeout(resolve, 10000));

        // 3. AUTH
        console.log("\n3. Ejecutando AUTH...");

        const resultadoAuth = await authClient(mac);

        console.log("Resultado AUTH:");
        console.dir(resultadoAuth, { depth: null });

        console.log("\n=== FIN DE PRUEBA ===");

    } catch (error) {
        console.error("\nERROR EN PRUEBA:");
        console.error(error);
        process.exit(1);
    }
}

main();