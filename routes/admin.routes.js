const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const { requiereAdmin } = require("../middleware/adminAuth");

router.get("/", adminController.raizAdmin);
router.get("/login", adminController.mostrarLogin);
router.post("/login", adminController.login);
router.get("/logout", adminController.logout);

router.get("/inicio", requiereAdmin, adminController.inicio);

// Pendiente: /usuarios, /usuarios/nuevo, /usuarios/editar/:id,
// /sesiones, /cuenta — se agregan cuando se construyan esas pantallas.

module.exports = router;