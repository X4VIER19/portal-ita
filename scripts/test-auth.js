require("dotenv").config();

const { authClient } = require("../services/omada");

async function main() {
    const mac = process.argv[2];

    if (!mac) {
        console.log("Uso:");
        console.log("node scripts/test-auth.js MAC");
        process.exit(1);
    }

    console.log("\n=== PRUEBA AUTH DIRECTO ===");
    console.log(`MAC: ${mac}\n`);

    try {
        const resultado = await authClient(mac);

        console.log("\n=== RESULTADO ===");
        console.dir(resultado, { depth: null });
    } catch (error) {
        console.error("\nERROR:");
        console.error(error);
        process.exit(1);
    }
}

main();