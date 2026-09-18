const express = require("express");
const path = require("path");
const session = require("express-session");
require("dotenv").config();

const portalRoutes = require("./routes/portal.routes");
const adminRoutes = require("./routes/admin.routes");
const errorHandler = require("./middleware/errorHandler");
const sessionStore = require("./services/sessionStore");

const app = express();
const PORT = process.env.PORT || 3000;

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
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.use("/admin", adminRoutes);
app.use("/", portalRoutes);
app.use(errorHandler);

app.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("PORTAL ITA - SERVER");
    console.log(`Local: http://localhost:${PORT}`);
    console.log("--------------------------------");
});