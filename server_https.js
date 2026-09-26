const express = require("express");
const path = require("path");
const https = require("https");
const fs = require("fs");
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

const sslOptions = {
    key: fs.readFileSync(path.join(__dirname, "certs", "server.key")),
    cert: fs.readFileSync(path.join(__dirname, "certs", "server.crt"))
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/styles", express.static(path.join(__dirname, "styles")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use('/icons/phosphor',
    express.static(
        path.join(__dirname, 'node_modules/@phosphor-icons/web')
    )
);

app.use(session({
    secret: process.env.SESSION_SECRET || "cambia_esto",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 8,
        sameSite: "lax",
        secure: true
    }
}));

// Debe ejecutarse después de session() y antes de montar las rutas.
app.use(attachCsrfToken);
app.use(csrfSynchronisedProtection);

app.use("/admin", adminRoutes);
app.use("/", portalRoutes);
app.use(errorHandler);

https.createServer(sslOptions, app).listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("PORTAL ITA - SERVER HTTPS");
    console.log(`Local: https://localhost:${PORT}`);
    console.log("--------------------------------");

    iniciarSincronizacionPeriodica(5 * 60 * 1000);
});
