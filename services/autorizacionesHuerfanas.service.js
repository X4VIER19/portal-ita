const pool = require("./database");

async function sincronizarAutorizacionesHuerfanas(registros, macsEnMySQL) {
    const [ssids] = await pool.query(
        `SELECT nombre_ssid
         FROM ssids_portal
         WHERE activo = TRUE`
    );

    const ssidsAdministrados = new Set(
        ssids.map(({ nombre_ssid }) => nombre_ssid)
    );

    const huerfanasActuales = registros.filter((registro) => {
        const mac = (registro.mac || "").toUpperCase();

        return registro.valid === true &&
            mac &&
            registro.ssid &&
            ssidsAdministrados.has(registro.ssid) &&
            !macsEnMySQL.has(mac);
    });

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query(
            `UPDATE autorizaciones_huerfanas
             SET estado = 'RESUELTA',
                 resuelta_en = COALESCE(resuelta_en, CURRENT_TIMESTAMP)
             WHERE estado = 'ACTIVA'`
        );

        for (const registro of huerfanasActuales) {
            const mac = registro.mac.toUpperCase();

            await connection.query(
                `INSERT INTO autorizaciones_huerfanas
                    (mac, ssid, admin_name, omada_start)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    admin_name = VALUES(admin_name),
                    omada_start = VALUES(omada_start),
                    ultima_deteccion = CURRENT_TIMESTAMP,
                    estado = 'ACTIVA',
                    resuelta_en = NULL`,
                [
                    mac,
                    registro.ssid,
                    registro.adminName || null,
                    registro.start || null
                ]
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return huerfanasActuales;
}

async function listarAutorizacionesHuerfanas() {
    const [rows] = await pool.query(
        `SELECT id, mac, ssid, admin_name, omada_start,
                primera_deteccion, ultima_deteccion, estado, resuelta_en
         FROM autorizaciones_huerfanas
         ORDER BY estado = 'ACTIVA' DESC, ultima_deteccion DESC`
    );

    return rows;
}

async function contarAutorizacionesHuerfanasPendientes() {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM autorizaciones_huerfanas
         WHERE estado = 'ACTIVA'`
    );

    return Number(rows[0].total);
}

async function eliminarRegistrosAutorizacionesHuerfanas() {
    const [resultado] = await pool.query(
        `DELETE FROM autorizaciones_huerfanas`
    );

    return resultado.affectedRows;
}

async function buscarAutorizacionHuerfanaPorId(id) {
    const [rows] = await pool.query(
        `SELECT id, mac, ssid, estado
         FROM autorizaciones_huerfanas
         WHERE id = ?
         LIMIT 1`,
        [id]
    );

    return rows[0] || null;
}

async function marcarAutorizacionHuerfanaResuelta(id) {
    await pool.query(
        `UPDATE autorizaciones_huerfanas
         SET estado = 'RESUELTA', resuelta_en = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id]
    );
}

module.exports = {
    sincronizarAutorizacionesHuerfanas,
    listarAutorizacionesHuerfanas,
    contarAutorizacionesHuerfanasPendientes,
    eliminarRegistrosAutorizacionesHuerfanas,
    buscarAutorizacionHuerfanaPorId,
    marcarAutorizacionHuerfanaResuelta
};
