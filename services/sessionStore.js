const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
require("dotenv").config();

const sessionStore = new MySQLStore({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    createDatabaseTable: false,
    schema: {
        tableName: "sessions",
        columnNames: {
            session_id: "session_id",
            expires: "expires",
            data: "data"
        }
    }
});

sessionStore.on("error", (error) => {
    console.error("Error en el store de sesiones (MySQL):", error);
});

module.exports = sessionStore;