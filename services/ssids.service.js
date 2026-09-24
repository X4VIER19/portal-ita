const pool = require("./database");

const TIPOS_VALIDOS = ["GENERAL", "DOCENTES", "ALUMNOS"];

// ------------------------------------------------------------------
// Configuración de SSIDs (ssids_portal)
// ------------------------------------------------------------------

async function listarSsids() {
    const [rows] = await pool.query(
        `SELECT id, nombre_ssid, tipo, activo, creado_en, actualizado_en
         FROM ssids_portal
         ORDER BY nombre_ssid ASC`
    );
    return rows;
}

async function buscarSsidPorId(id) {
    const [rows] = await pool.query(
        `SELECT id, nombre_ssid, tipo, activo
         FROM ssids_portal
         WHERE id = ?
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

// Usado en la validación de login: solo SSIDs marcados como activos
// cuentan como "registrados" para efectos de autenticación.
async function buscarSsidActivoPorNombre(nombreSsid) {
    const [rows] = await pool.query(
        `SELECT id, nombre_ssid, tipo, activo
         FROM ssids_portal
         WHERE nombre_ssid = ? AND activo = TRUE
         LIMIT 1`,
        [nombreSsid]
    );
    return rows[0] || null;
}

async function crearSsid({ nombre_ssid, tipo }) {
    await pool.query(
        `INSERT INTO ssids_portal (nombre_ssid, tipo)
         VALUES (?, ?)`,
        [nombre_ssid, tipo]
    );
}

async function actualizarSsid(id, { nombre_ssid, tipo, activo }) {
    await pool.query(
        `UPDATE ssids_portal
         SET nombre_ssid = ?, tipo = ?, activo = ?
         WHERE id = ?`,
        [nombre_ssid, tipo, activo ? 1 : 0, id]
    );
}

async function eliminarSsid(id) {
    await pool.query(`DELETE FROM ssids_portal WHERE id = ?`, [id]);
}

// ------------------------------------------------------------------
// SSIDs desconocidos detectados (diagnóstico, ssids_desconocidos_detectados)
// Fail-closed ya ocurrió antes de llamar a esto; esto es solo registro
// para revisión administrativa posterior. Nunca autoriza ni modifica
// nada relacionado con Omada o sesiones_activas.
// ------------------------------------------------------------------

async function registrarSsidDesconocido(nombreSsid) {
    if (!nombreSsid) {
        return;
    }

    await pool.query(
        `INSERT INTO ssids_desconocidos_detectados (nombre_ssid)
         VALUES (?)
         ON DUPLICATE KEY UPDATE
            veces_detectado = veces_detectado + 1,
            ultima_deteccion = CURRENT_TIMESTAMP`,
        [nombreSsid]
    );
}

async function listarSsidsDesconocidos() {
    const [rows] = await pool.query(
        `SELECT id, nombre_ssid, primera_deteccion, ultima_deteccion,
                veces_detectado, revisado
         FROM ssids_desconocidos_detectados
         ORDER BY ultima_deteccion DESC`
    );
    return rows;
}

async function contarSsidsDesconocidosPendientes() {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM ssids_desconocidos_detectados
         WHERE revisado = FALSE`
    );
    return Number(rows[0].total);
}

async function marcarSsidDesconocidoRevisado(id, revisado) {
    await pool.query(
        `UPDATE ssids_desconocidos_detectados
         SET revisado = ?
         WHERE id = ?`,
        [revisado ? 1 : 0, id]
    );
}

async function eliminarSsidDesconocido(id) {
    await pool.query(
        `DELETE FROM ssids_desconocidos_detectados WHERE id = ?`,
        [id]
    );
}

module.exports = {
    TIPOS_VALIDOS,
    listarSsids,
    buscarSsidPorId,
    buscarSsidActivoPorNombre,
    crearSsid,
    actualizarSsid,
    eliminarSsid,
    registrarSsidDesconocido,
    listarSsidsDesconocidos,
    contarSsidsDesconocidosPendientes,
    marcarSsidDesconocidoRevisado,
    eliminarSsidDesconocido
};
