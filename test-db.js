const pool = require("./services/database");

async function testDatabase() {
    try {
        const [usuarios] = await pool.query("SELECT COUNT(*) AS total FROM usuarios");
        const [sesiones] = await pool.query("SELECT COUNT(*) AS total FROM sesiones_activas");

        console.log("Conexión a MySQL exitosa");
        console.log("Base de datos: portal_ita");
        console.log("Usuarios:", usuarios[0].total);
        console.log("Sesiones activas:", sesiones[0].total);

    } catch (error) {
        console.error("Error al consultar MySQL:");
        console.error(error.message);

    } finally {
        await pool.end();
    }
}

testDatabase();