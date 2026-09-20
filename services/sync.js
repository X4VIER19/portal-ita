const { listarAuthedRecords } = require("./omada");
const {
    listarTodasSesionesActivas,
    eliminarSesionActiva
} = require("./usuarios.service");

function obtenerUltimoEstadoPorMac(registros) {
    const mapa = new Map();

    for (const registro of registros) {
        const mac = (registro.mac || "").toUpperCase();
        if (!mac) continue;

        const actual = mapa.get(mac);
        if (!actual || (registro.start || 0) > (actual.start || 0)) {
            mapa.set(mac, registro);
        }
    }

    return mapa;
}

async function sincronizarSesiones() {
    const sesiones = await listarTodasSesionesActivas();

    if (sesiones.length === 0) {
        return { revisadas: 0, eliminadas: 0, error: false };
    }

    let registros;
    try {
        registros = await listarAuthedRecords();
    } catch (err) {
        console.error("Sync: no se pudo consultar authed-records de Omada. Se aborta este ciclo:", err.message);
        return { revisadas: sesiones.length, eliminadas: 0, error: true };
    }

    const estadoPorMac = obtenerUltimoEstadoPorMac(registros);
    let eliminadas = 0;

    for (const sesion of sesiones) {
        const macNormalizada = (sesion.mac || "").toUpperCase();
        const registro = estadoPorMac.get(macNormalizada);

        const yaNoVigente = !registro || registro.valid === false;

        if (yaNoVigente) {
            await eliminarSesionActiva(sesion.usuario_id);
            eliminadas++;

            const motivo = !registro
                ? "sin registro en Omada"
                : "valid=false en Omada";
            console.log(`Sync: sesión eliminada (usuario_id=${sesion.usuario_id}, mac=${sesion.mac}) — ${motivo}.`);
        }
    }

    console.log(`Sync: ${sesiones.length} sesión(es) revisada(s), ${eliminadas} eliminada(s).`);
    return { revisadas: sesiones.length, eliminadas, error: false };
}

let intervaloActivo = null;
function iniciarSincronizacionPeriodica(intervaloMs = 5 * 60 * 1000) {
    if (intervaloActivo) {
        return;
    }

    console.log(`Sync: sincronización automática activada cada ${Math.round(intervaloMs / 60000)} minuto(s).`);

    intervaloActivo = setInterval(() => {
        sincronizarSesiones().catch(err => {
            console.error("Sync: error inesperado durante la sincronización periódica:", err);
        });
    }, intervaloMs);
}

module.exports = {
    sincronizarSesiones,
    iniciarSincronizacionPeriodica
};