const pool = require("./database");

async function buscarUsuarioPorCorreo(correo) {
    const [rows] = await pool.query(
        `SELECT id, nombre, apellido, correo, contrasena_hash,
                requiere_cambio_contrasena, contrasena_temporal_expira_en,
                version_credencial, contrasena_actualizada_en,
                rol, activo
         FROM usuarios
         WHERE correo = ?
         LIMIT 1`,
        [correo]
    );
    return rows[0] || null;
}

async function buscarSesionActiva(usuarioId) {
    const [rows] = await pool.query(
        `SELECT usuario_id, mac, ssid, autorizado_en
         FROM sesiones_activas
         WHERE usuario_id = ?
         LIMIT 1`,
        [usuarioId]
    );
    return rows[0] || null;
}

async function buscarSesionActivaPorMac(mac) {
    const [rows] = await pool.query(
        `SELECT usuario_id, mac, ssid, autorizado_en
         FROM sesiones_activas
         WHERE mac = ?
         LIMIT 1`,
        [mac]
    );
    return rows[0] || null;
}

async function guardarSesionActiva(usuarioId, mac, ssid) {
    await pool.query(
        `INSERT INTO sesiones_activas (usuario_id, mac, ssid)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            mac = VALUES(mac),
            ssid = VALUES(ssid),
            autorizado_en = CURRENT_TIMESTAMP`,
        [usuarioId, mac, ssid]
    );
}

async function eliminarSesionActiva(usuarioId) {
    await pool.query(`DELETE FROM sesiones_activas WHERE usuario_id = ?`, [usuarioId]);
}

async function listarTodasSesionesActivas() {
    const [rows] = await pool.query(`SELECT usuario_id, mac, ssid FROM sesiones_activas`);
    return rows;
}

async function obtenerResumenAdmin() {
    const [rows] = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM usuarios) AS usuarios_totales,
            (SELECT COUNT(*) FROM sesiones_activas) AS sesiones_activas,
            (SELECT COUNT(*) FROM sesiones_activas s INNER JOIN usuarios u ON u.id = s.usuario_id WHERE u.rol = 'docente') AS docentes_activos,
            (SELECT COUNT(*) FROM sesiones_activas s INNER JOIN usuarios u ON u.id = s.usuario_id WHERE u.rol = 'alumno') AS alumnos_activos,
            (SELECT COUNT(*) FROM autorizaciones_huerfanas WHERE estado = 'ACTIVA') AS huerfanas_pendientes`
    );

    const resumen = rows[0];
    return {
        usuariosTotales: Number(resumen.usuarios_totales),
        sesionesActivas: Number(resumen.sesiones_activas),
        docentesActivos: Number(resumen.docentes_activos),
        alumnosActivos: Number(resumen.alumnos_activos),
        huerfanasPendientes: Number(resumen.huerfanas_pendientes)
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
        `SELECT id, nombre, apellido, correo, rol, activo,
                requiere_cambio_contrasena, contrasena_temporal_expira_en,
                creado_en
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
        `SELECT id, nombre, apellido, correo, rol, activo,
                requiere_cambio_contrasena, contrasena_temporal_expira_en,
                version_credencial, contrasena_actualizada_en
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

async function buscarCredencialUsuarioPorId(id) {
    const [rows] = await pool.query(
        `SELECT id, correo, contrasena_hash, activo,
                requiere_cambio_contrasena, contrasena_temporal_expira_en,
                version_credencial
         FROM usuarios
         WHERE id = ?
         LIMIT 1`,
        [id]
    );
    return rows[0] || null;
}

async function asignarContrasenaProvisional(id, contrasenaHash, expiraEn) {
    const [resultado] = await pool.query(
        `UPDATE usuarios
         SET contrasena_hash = ?,
             requiere_cambio_contrasena = TRUE,
             contrasena_temporal_expira_en = ?,
             version_credencial = version_credencial + 1,
             contrasena_actualizada_en = NULL
         WHERE id = ?`,
        [contrasenaHash, expiraEn, id]
    );

    return resultado.affectedRows === 1;
}

async function completarCambioContrasena(id, versionCredencial, contrasenaHash) {
    const [resultado] = await pool.query(
        `UPDATE usuarios
         SET contrasena_hash = ?,
             requiere_cambio_contrasena = FALSE,
             contrasena_temporal_expira_en = NULL,
             version_credencial = version_credencial + 1,
             contrasena_actualizada_en = CURRENT_TIMESTAMP
         WHERE id = ?
           AND version_credencial = ?
           AND requiere_cambio_contrasena = TRUE
           AND contrasena_temporal_expira_en > CURRENT_TIMESTAMP`,
        [contrasenaHash, id, versionCredencial]
    );

    return resultado.affectedRows === 1;
}

async function crearUsuario({ nombre, apellido, correo, contrasena_hash, rol, expira_en }) {
    const [resultado] = await pool.query(
        `INSERT INTO usuarios (
            nombre, apellido, correo, contrasena_hash, rol,
            requiere_cambio_contrasena, contrasena_temporal_expira_en,
            version_credencial
         )
         VALUES (?, ?, ?, ?, ?, TRUE, ?, 1)`,
        [nombre, apellido, correo, contrasena_hash, rol, expira_en]
    );

    return resultado.insertId;
}

async function cambiarEstadoUsuario(id, activo) {
    await pool.query(`UPDATE usuarios SET activo = ? WHERE id = ?`, [activo, id]);
}

function construirFiltrosSesiones({ busqueda = "", rol = "" } = {}) {
    const condiciones = [];
    const valores = [];

    if (busqueda) {
        condiciones.push(`(u.nombre LIKE ? OR u.apellido LIKE ? OR u.correo LIKE ? OR s.mac LIKE ? OR s.ssid LIKE ?)`);
        const termino = `%${busqueda}%`;
        valores.push(termino, termino, termino, termino, termino);
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
        `SELECT s.usuario_id, s.mac, s.ssid, s.autorizado_en, u.nombre, u.apellido, u.correo, u.rol
         FROM sesiones_activas s
         JOIN usuarios u ON u.id = s.usuario_id
         ${where}
         ORDER BY s.autorizado_en DESC
         LIMIT ? OFFSET ?`,
        [...valores, limite, offset]
    );
    return rows;
}

async function actualizarUsuario(id, { nombre, apellido, correo, rol }) {
    await pool.query(
        `UPDATE usuarios
         SET nombre = ?, apellido = ?, correo = ?, rol = ?
         WHERE id = ?`,
        [nombre, apellido, correo, rol, id]
    );
}

module.exports = {
    buscarUsuarioPorCorreo,
    buscarSesionActiva,
    buscarSesionActivaPorMac,
    guardarSesionActiva,
    eliminarSesionActiva,
    listarTodasSesionesActivas,
    obtenerResumenAdmin,
    listarUsuariosPaginados,
    contarUsuarios,
    buscarUsuarioPorId,
    buscarCredencialUsuarioPorId,
    asignarContrasenaProvisional,
    completarCambioContrasena,
    crearUsuario,
    cambiarEstadoUsuario,
    listarSesionesPaginadas,
    contarSesiones,
    actualizarUsuario
};
