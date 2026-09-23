require("dotenv").config();

const { obtenerInfoCliente } = require("../services/omada");

/**
 * PRUEBA DIAGNÓSTICA — NO TOCA AUTH/UNAUTH
 * ------------------------------------------
 * Objetivo: determinar si Omada reporta el campo `ssid` de un cliente
 * ANTES de que nosotros llamemos a /auth, es decir, mientras el
 * dispositivo está simplemente conectado al AP / portal cautivo
 * pero todavía no autorizado (estado esperado: PENDING).
 *
 * Este script NO autoriza ni desautoriza nada. Solo hace polling
 * de obtenerInfoCliente() cada pocos segundos y va registrando
 * los cambios relevantes.
 *
 * Uso:
 *   node scripts/test-ssid-preauth.js MAC [duracionSegundos] [intervaloSegundos]
 *
 * Ejemplo:
 *   node scripts/test-ssid-preauth.js 2C-33-7A-2E-55-8B 60 3
 */

function resumen(info) {
    if (!info || !info.result) {
        return {
            errorCode: info?.errorCode,
            msg: info?.msg,
            ssid: undefined,
            active: undefined,
            authStatus: undefined
        };
    }

    const r = info.result;

    return {
        ssid: r.ssid,
        active: r.active,
        authStatus: r.authStatus,
        apMac: r.apMac,
        radioId: r.radioId,
        connectType: r.connectType,
        vid: r.vid,
        rssi: r.rssi,
        lastSeen: r.lastSeen,
        uptime: r.uptime
    };
}

function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatoHora() {
    return new Date().toISOString().split("T")[1].replace("Z", "");
}

async function main() {
    const mac = process.argv[2];
    const duracionSegundos = Number.parseInt(process.argv[3], 10) || 60;
    const intervaloSegundos = Number.parseInt(process.argv[4], 10) || 3;

    if (!mac) {
        console.log("Uso:");
        console.log(
            "node scripts/test-ssid-preauth.js MAC [duracionSegundos] [intervaloSegundos]"
        );
        console.log("");
        console.log(
            "Ejemplo: node scripts/test-ssid-preauth.js 2C-33-7A-2E-55-8B 60 3"
        );
        process.exit(1);
    }

    console.log("\n=== DIAGNÓSTICO: DISPONIBILIDAD DE SSID ANTES DE AUTH ===");
    console.log(`MAC objetivo:        ${mac}`);
    console.log(`Duración total:      ${duracionSegundos}s`);
    console.log(`Intervalo de sondeo: ${intervaloSegundos}s`);
    console.log(
        "\nIMPORTANTE: este script NO ejecuta auth ni unauth. " +
        "Solo observa.\n"
    );
    console.log(
        "Asegúrate de que el dispositivo esté conectado al AP de " +
        "prueba y NO haya iniciado sesión en el portal (estado " +
        "esperado: PENDING / sin autorizar).\n"
    );

    const lecturas = [];
    let anterior = null;

    const inicio = Date.now();
    let numeroLectura = 0;

    while ((Date.now() - inicio) / 1000 < duracionSegundos) {
        numeroLectura++;

        let info;
        let error = null;

        try {
            info = await obtenerInfoCliente(mac);
        } catch (err) {
            error = err.message;
        }

        const datos = error ? { error } : resumen(info);
        const tiempoTranscurrido = Math.round((Date.now() - inicio) / 1000);

        const cambioSsid =
            anterior !== null && anterior.ssid !== datos.ssid;

        const marcaCambio = cambioSsid ? "  <-- CAMBIO DE SSID" : "";

        console.log(
            `[t=${tiempoTranscurrido}s] Lectura #${numeroLectura} ` +
            `(${formatoHora()})${marcaCambio}`
        );
        console.dir(datos, { depth: null });
        console.log("");

        lecturas.push({
            numeroLectura,
            tiempoTranscurrido,
            hora: formatoHora(),
            ...datos
        });

        anterior = datos;

        await esperar(intervaloSegundos * 1000);
    }

    console.log("=== RESUMEN FINAL ===\n");

    const conSsid = lecturas.filter((l) => l.ssid);
    const sinSsid = lecturas.filter((l) => !l.ssid && !l.error);
    const conError = lecturas.filter((l) => l.error);

    console.log(`Total de lecturas:          ${lecturas.length}`);
    console.log(`Lecturas CON ssid poblado:  ${conSsid.length}`);
    console.log(`Lecturas SIN ssid:          ${sinSsid.length}`);
    console.log(`Lecturas con error/excepc.: ${conError.length}`);

    if (conSsid.length > 0) {
        console.log(
            `\nPrimera lectura con ssid poblado: ` +
            `t=${conSsid[0].tiempoTranscurrido}s ` +
            `(lectura #${conSsid[0].numeroLectura}), ` +
            `ssid="${conSsid[0].ssid}", ` +
            `authStatus=${conSsid[0].authStatus}, ` +
            `active=${conSsid[0].active}`
        );
    } else {
        console.log(
            "\nEl campo ssid NUNCA apareció poblado durante la prueba."
        );
    }

    // Detectar si hubo algún cambio de ssid durante la ventana observada.
    const ssidsVistos = [
        ...new Set(lecturas.filter((l) => l.ssid).map((l) => l.ssid))
    ];

    if (ssidsVistos.length > 1) {
        console.log(
            `\nADVERTENCIA: se observaron múltiples valores de ssid ` +
            `durante la prueba: ${ssidsVistos.join(", ")}`
        );
    } else if (ssidsVistos.length === 1) {
        console.log(`\nssid observado (constante): ${ssidsVistos[0]}`);
    }

    console.log("\n=== FIN DEL DIAGNÓSTICO ===");
    console.log(
        "Guarda esta salida completa para documentar el hallazgo en " +
        "el resumen del proyecto (comportamiento real de Omada respecto " +
        "a `ssid` antes del login/AUTH)."
    );
}

main().catch((err) => {
    console.error("\nERROR EN DIAGNÓSTICO:");
    console.error(err);
    process.exit(1);
});
