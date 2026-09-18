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

async function listarUsuarios() {
    const [rows] = await pool.query(
        `SELECT id, nombre, apellido, correo, rol, activo, creado_en
         FROM usuarios
         ORDER BY creado_en DESC`
    );

    return rows;
}

async function buscarUsuarioPorId(id) {
    const [rows] = await pool.query(
        `SELECT id, nombre, apellido, correo, rol, activo
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [id]
    );

    return rows[0] || null;
}

async function crearUsuario({ nombre, apellido, correo, contrasena_hash, rol }) {
    await pool.query(
        `INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, rol)
         VALUES (?, ?, ?, ?, ?)`,
        [nombre, apellido, correo, contrasena_hash, rol]
    );
}

async function cambiarEstadoUsuario(id, activo) {
    await pool.query(
        `UPDATE usuarios SET activo = ? WHERE id = ?`,
        [activo, id]
    );
}

async function listarSesionesActivas() {
    const [rows] = await pool.query(
        `SELECT s.usuario_id, s.mac, s.autorizado_en,
                u.nombre, u.apellido, u.correo, u.rol
         FROM sesiones_activas s
         JOIN usuarios u ON u.id = s.usuario_id
         ORDER BY s.autorizado_en DESC`
    );

    return rows;
}

async function actualizarUsuario(id, { nombre, apellido, correo, rol, contrasena_hash }) {
    const campos = ["nombre = ?", "apellido = ?", "correo = ?", "rol = ?"];
    const valores = [nombre, apellido, correo, rol];

    if (contrasena_hash) {
        campos.push("contrasena_hash = ?");
        valores.push(contrasena_hash);
    }

    valores.push(id);

    await pool.query(
        `UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`,
        valores
    );
}

module.exports = {
    buscarUsuarioPorCorreo,
    buscarSesionActiva,
    guardarSesionActiva,
    eliminarSesionActiva,
    listarUsuarios,
    buscarUsuarioPorId,
    crearUsuario,
    cambiarEstadoUsuario,
    listarSesionesActivas,
    actualizarUsuario
};