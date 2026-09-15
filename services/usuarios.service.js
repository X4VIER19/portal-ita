const pool = require("./database");

async function buscarUsuarioPorCorreo(correo) {
    const [rows] = await pool.query(
        `SELECT id, nombre, apellido, correo, contrasena_hash, rol, activo
         FROM usuarios
         WHERE correo = ?
         LIMIT 1`,
        [correo]
    );

    return rows[0] || null;
}

async function buscarSesionActiva(usuarioId) {
    const [rows] = await pool.query(
        `SELECT usuario_id, mac, autorizado_en
         FROM sesiones_activas
         WHERE usuario_id = ?
         LIMIT 1`,
        [usuarioId]
    );

    return rows[0] || null;
}

async function guardarSesionActiva(usuarioId, mac) {
    await pool.query(
        `INSERT INTO sesiones_activas (usuario_id, mac)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
             mac = VALUES(mac),
             autorizado_en = CURRENT_TIMESTAMP`,
        [usuarioId, mac]
    );
}

async function eliminarSesionActiva(usuarioId) {
    await pool.query(
        `DELETE FROM sesiones_activas
         WHERE usuario_id = ?`,
        [usuarioId]
    );
}

module.exports = {
    buscarUsuarioPorCorreo,
    buscarSesionActiva,
    guardarSesionActiva,
    eliminarSesionActiva
};