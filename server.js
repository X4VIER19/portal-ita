const express = require("express");
const path = require("path");
const http = require("http");
const session = require("express-session");
require("dotenv").config();

const portalRoutes = require("./routes/portal.routes");
const adminRoutes = require("./routes/admin.routes");
const errorHandler = require("./middleware/errorHandler");
const sessionStore = require("./services/sessionStore");
const { iniciarSincronizacionPeriodica } = require("./services/sync");
const { attachCsrfToken, csrfSynchronisedProtection } = require("./middleware/csrf");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/styles", express.static(path.join(__dirname, "styles")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

app.use(
    "/icons/phosphor",
    express.static(
        path.join(__dirname, "node_modules/@phosphor-icons/web")
    )
);

app.use(
    session({
        secret: process.env.SESSION_SECRET || "cambia_esto",
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 8,
            // sameSite: 'lax' es la primera línea de defensa contra CSRF
            // (el navegador ya no envía la cookie de sesión en la mayoría
            // de las peticiones cross-site). El token CSRF de abajo es la
            // segunda línea, para los casos que sameSite no cubre.
            sameSite: "lax"
        }
    })
);

// ------------------------------------------------------------------
// Protección CSRF (ver middleware/csrf.js).
// Debe ir DESPUÉS de session() (necesita req.session) y ANTES de
// montar las rutas, para que aplique a todo /admin y a todo el portal.
// ------------------------------------------------------------------
app.use(attachCsrfToken);
app.use(csrfSynchronisedProtection);

app.use("/admin", adminRoutes);
app.use("/", portalRoutes);
app.use(errorHandler);

http.createServer(app).listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("PORTAL ITA - SERVER HTTP");
    console.log(`Local: http://localhost:${PORT}`);
    console.log("--------------------------------");

    iniciarSincronizacionPeriodica(5 * 60 * 1000);
});
