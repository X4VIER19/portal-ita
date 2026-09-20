require("dotenv").config();
const { listarAuthedRecords } = require("./services/omada");

async function main() {
    const macBuscada = process.argv[2];

    if (!macBuscada) {
        console.log("Uso: node test-authed-records.js <MAC>");
        process.exit(1);
    }

    console.log(`Consultando authed-records y buscando MAC: ${macBuscada}\n`);

    const registros = await listarAuthedRecords();

    console.log(`Total de registros devueltos por Omada: ${registros.length}\n`);

    const encontrados = registros.filter(
        r => (r.mac || "").toLowerCase() === macBuscada.toLowerCase()
    );

    if (encontrados.length === 0) {
        console.log("⚠️  Esa MAC NO aparece en la lista de authed-records.");
        console.log("   (Esto es una de las dos ramas posibles: el registro ya no existe.)");
        process.exit(0);
    }

    const ordenados = [...encontrados].sort((a, b) => {
        const finA = a.end || a.start || 0;
        const finB = b.end || b.start || 0;
        return finB - finA;
    });

    console.log(`✅ Se encontraron ${ordenados.length} registro(s) para esta MAC.\n`);

    const etiquetasAuthType = {
        0: "No Auth", 1: "Simple Password", 2: "External Radius", 3: "Voucher",
        4: "External Portal Server", 5: "Local User", 6: "SMS", 7: "Facebook",
        8: "Hotspot Radius", 9: "Mac Auth", 10: "Admin auth", 12: "Form auth"
    };

    ordenados.forEach((registro, i) => {
        const etiqueta = i === 0 ? "MÁS RECIENTE →" : `histórico #${i}`;
        console.log(`--- ${etiqueta} (id: ${registro.id}) ---`);
        console.log(`  valid:     ${registro.valid}`);
        console.log(`  authType:  ${registro.authType} (${etiquetasAuthType[registro.authType] || "desconocido"})`);
        console.log(`  duration:  ${registro.duration}s`);
        if (registro.start) {
            console.log(`  start:     ${new Date(registro.start).toLocaleString("es-MX")}`);
        }
        if (registro.end) {
            console.log(`  end:       ${new Date(registro.end).toLocaleString("es-MX")}`);
        }
        console.log("");
    });

    console.log("JSON completo del más reciente:\n");
    console.log(JSON.stringify(ordenados[0], null, 2));
}

main().catch(err => {
    console.error("Error al ejecutar la prueba:", err.message || err);
    process.exit(1);
});
