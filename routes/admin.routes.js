const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const { requiereAdmin } = require("../middleware/adminAuth");
const asyncHandler = require("../utils/asyncHandler");
const {
    limiteAdminPorIp,
    limiteAdminPorCuenta
} = require("../middleware/rateLimiters");

// AUTH ADMIN
router.get("/", adminController.raizAdmin);
router.get("/login", adminController.mostrarLogin);
router.post(
    "/login",
    limiteAdminPorIp,
    limiteAdminPorCuenta,
    asyncHandler(adminController.login)
);
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

// AUTORIZACIONES DE OMADA SIN SESIÓN EN MYSQL
router.get("/autorizaciones-huerfanas", requiereAdmin, asyncHandler(adminController.mostrarAutorizacionesHuerfanas));
router.post("/autorizaciones-huerfanas/limpiar", requiereAdmin, asyncHandler(adminController.limpiarRegistrosAutorizacionesHuerfanas));
router.post("/autorizaciones-huerfanas/:id/desautorizar", requiereAdmin, asyncHandler(adminController.desautorizarAutorizacionHuerfana));

// SSIDS
// IMPORTANTE: la ruta "/ssids/desconocidos" debe declararse ANTES de
// "/ssids/editar/:id" y "/ssids/nuevo" para que Express no intente
// interpretarla como un :id.
router.get("/ssids/desconocidos", requiereAdmin, asyncHandler(adminController.mostrarSsidsDesconocidos));
router.post("/ssids/desconocidos/:id/revisado", requiereAdmin, asyncHandler(adminController.marcarSsidDesconocidoRevisadoController));
router.post("/ssids/desconocidos/:id/eliminar", requiereAdmin, asyncHandler(adminController.eliminarSsidDesconocidoController));

router.get("/ssids", requiereAdmin, asyncHandler(adminController.mostrarSsids));
router.get("/ssids/nuevo", requiereAdmin, adminController.mostrarFormularioNuevoSsid);
router.post("/ssids/nuevo", requiereAdmin, asyncHandler(adminController.crearSsid));
router.get("/ssids/editar/:id", requiereAdmin, asyncHandler(adminController.mostrarFormularioEditarSsid));
router.post("/ssids/editar/:id", requiereAdmin, asyncHandler(adminController.actualizarSsid));
router.post("/ssids/:id/eliminar", requiereAdmin, asyncHandler(adminController.eliminarSsid));

module.exports = router;
