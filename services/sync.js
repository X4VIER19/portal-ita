const { listarAuthedRecords } = require("./omada");
const {
    listarTodasSesionesActivas,
    eliminarSesionActiva
} = require("./usuarios.service");

// Confirmado con pruebas reales contra el Controller (ver Resumen de
// contexto, sección "authed-records"): Omada NUNCA actualiza un registro
// existente, siempre crea uno nuevo por cada ciclo de auth/unauth. Esto
// significa que una MAC casi siempre va a "existir" en el historial, así
// que el criterio de sincronización no puede ser "¿existe la MAC?", sino
// "¿cuál es el registro MÁS RECIENTE de esa MAC, y sigue siendo valid?".
//
// También confirmado: no filtramos por `authType`, porque todas las
// autorizaciones hechas por este backend (vía OAuth Client Credentials)
// quedan registradas como authType 10 (Admin auth), sin importar que el
// usuario final haya entrado por el portal externo.

// Dado el arreglo completo de authed-records, construye un mapa
// MAC -> registro más reciente de esa MAC (por `start`).
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

// Compara sesiones_activas contra el estado real de Omada y elimina de la
// BD las sesiones cuya MAC ya no está vigente (valid === false) o de las
// que Omada no tiene ningún registro (caso raro, p. ej. historial purgado).
//
// Devuelve un resumen { revisadas, eliminadas, error } para poder mostrar
// feedback tanto en el log del servidor como en el panel de admin.
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

// Inicia la sincronización automática periódica. Se llama una sola vez
// desde server.js al arrancar el proceso.
function iniciarSincronizacionPeriodica(intervaloMs = 5 * 60 * 1000) {
    if (intervaloActivo) {
        return; // ya estaba corriendo, evita duplicar el interval
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
