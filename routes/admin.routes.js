const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const { requiereAdmin } = require("../middleware/adminAuth");
const asyncHandler = require("../utils/asyncHandler");

// AUTH ADMIN
router.get("/", adminController.raizAdmin);
router.get("/login", adminController.mostrarLogin);
router.post("/login", asyncHandler(adminController.login));
router.get("/logout", adminController.logout);

// INICIO
router.get("/inicio", requiereAdmin, asyncHandler(adminController.inicio));
router.post("/inicio/sincronizar", requiereAdmin, asyncHandler(adminController.sincronizarSesionesInicio));

// USUARIOS
router.get("/usuarios", requiereAdmin, asyncHandler(adminController.mostrarUsuarios));
router.get("/usuarios/nuevo", requiereAdmin, adminController.mostrarFormularioNuevo);
router.post("/usuarios/nuevo", requiereAdmin, asyncHandler(adminController.crearUsuario));
router.post("/usuarios/:id/toggle", requiereAdmin, asyncHandler(adminController.toggleActivo));
router.get("/usuarios/editar/:id", requiereAdmin, asyncHandler(adminController.mostrarFormularioEditar));
router.post("/usuarios/editar/:id", requiereAdmin, asyncHandler(adminController.actualizarUsuario));

// SESIONES
router.get("/sesiones", requiereAdmin, asyncHandler(adminController.mostrarSesiones));
router.post("/sesiones/:usuarioId/desconectar", requiereAdmin, asyncHandler(adminController.desconectarSesion));
router.post("/sesiones/sincronizar", requiereAdmin, asyncHandler(adminController.sincronizarSesionesManual));

module.exports = router;