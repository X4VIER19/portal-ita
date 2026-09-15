const express = require("express");
require("dotenv").config();

const portalRoutes = require("./routes/portal.routes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/", portalRoutes);

app.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("PORTAL ITA - SERVER");
    console.log("--------------------------------");
    console.log(`Puerto: ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log("--------------------------------");
});