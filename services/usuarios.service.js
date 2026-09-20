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
         ON DUPLICATE KEY UPDATE mac = VALUES(mac), autorizado_en = CURRENT_TIMESTAMP`,
        [usuarioId, mac]
    );
}

async function eliminarSesionActiva(usuarioId) {
    await pool.query(`DELETE FROM sesiones_activas WHERE usuario_id = ?`, [usuarioId]);
}

async function listarTodasSesionesActivas() {
    const [rows] = await pool.query(`SELECT usuario_id, mac FROM sesiones_activas`);
    return rows;
}

async function obtenerResumenAdmin() {
    const [rows] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM usuarios) AS usuarios_totales,
            (SELECT COUNT(*) FROM sesiones_activas) AS sesiones_activas,
            (SELECT COUNT(*) FROM sesiones_activas s INNER JOIN usuarios u ON u.id = s.usuario_id WHERE u.rol = 'docente') AS docentes_activos,
            (SELECT COUNT(*) FROM sesiones_activas s INNER JOIN usuarios u ON u.id = s.usuario_id WHERE u.rol = 'alumno') AS alumnos_activos`
    );

    const resumen = rows[0];
    return {
        usuariosTotales: Number(resumen.usuarios_totales),
        sesionesActivas: Number(resumen.sesiones_activas),
        docentesActivos: Number(resumen.docentes_activos),
        alumnosActivos: Number(resumen.alumnos_activos)
    };
}

function construirFiltrosUsuarios({ busqueda = "", rol = "", estado = "" } = {}) {
    const condiciones = [];
    const valores = [];

    if (busqueda) {
        condiciones.push(`(nombre LIKE ? OR apellido LIKE ? OR correo LIKE ?)`);
        const termino = `%${busqueda}%`;
        valores.push(termino, termino, termino);
    }

    if (["admin", "docente", "alumno"].includes(rol)) {
        condiciones.push("rol = ?");
        valores.push(rol);
    }

    if (estado === "activo" || estado === "inactivo") {
        condiciones.push("activo = ?");
        valores.push(estado === "activo" ? 1 : 0);
    }

    return {
        where: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "",
        valores
    };
}

async function contarUsuarios(filtros = {}) {
    const { where, valores } = construirFiltrosUsuarios(filtros);
    const [rows] = await pool.query(`SELECT COUNT(*) AS total FROM usuarios ${where}`, valores);
    return Number(rows[0].total);
}

async function listarUsuariosPaginados({ busqueda = "", rol = "", estado = "", limite = 10, offset = 0 } = {}) {
    const { where, valores } = construirFiltrosUsuarios({ busqueda, rol, estado });
    const [rows] = await pool.query(
        `SELECT id, nombre, apellido, correo, rol, activo, creado_en
         FROM usuarios
         ${where}
         ORDER BY creado_en DESC
         LIMIT ? OFFSET ?`,
        [...valores, limite, offset]
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
    await pool.query(`UPDATE usuarios SET activo = ? WHERE id = ?`, [activo, id]);
}

function construirFiltrosSesiones({ busqueda = "", rol = "" } = {}) {
    const condiciones = [];
    const valores = [];

    if (busqueda) {
        condiciones.push(`(u.nombre LIKE ? OR u.apellido LIKE ? OR u.correo LIKE ? OR s.mac LIKE ?)`);
        const termino = `%${busqueda}%`;
        valores.push(termino, termino, termino, termino);
    }

    if (["admin", "docente", "alumno"].includes(rol)) {
        condiciones.push("u.rol = ?");
        valores.push(rol);
    }

    return {
        where: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "",
        valores
    };
}

async function contarSesiones({ busqueda = "", rol = "" } = {}) {
    const { where, valores } = construirFiltrosSesiones({ busqueda, rol });
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM sesiones_activas s
         JOIN usuarios u ON u.id = s.usuario_id
         ${where}`,
        valores
    );
    return Number(rows[0].total);
}

async function listarSesionesPaginadas({ busqueda = "", rol = "", limite = 10, offset = 0 } = {}) {
    const { where, valores } = construirFiltrosSesiones({ busqueda, rol });
    const [rows] = await pool.query(
        `SELECT s.usuario_id, s.mac, s.autorizado_en, u.nombre, u.apellido, u.correo, u.rol
         FROM sesiones_activas s
         JOIN usuarios u ON u.id = s.usuario_id
         ${where}
         ORDER BY s.autorizado_en DESC
         LIMIT ? OFFSET ?`,
        [...valores, limite, offset]
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
        `UPDATE usuarios
         SET ${campos.join(", ")}
         WHERE id = ?`,
        valores
    );
}

module.exports = {
    buscarUsuarioPorCorreo,
    buscarSesionActiva,
    guardarSesionActiva,
    eliminarSesionActiva,
    listarTodasSesionesActivas,
    obtenerResumenAdmin,
    listarUsuariosPaginados,
    contarUsuarios,
    buscarUsuarioPorId,
    crearUsuario,
    cambiarEstadoUsuario,
    listarSesionesPaginadas,
    contarSesiones,
    actualizarUsuario
};