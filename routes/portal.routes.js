const express = require("express");
const router = express.Router();

const portalController = require("../controllers/portal.controller");
const restablecimientoController = require("../controllers/restablecimiento.controller");
const asyncHandler = require("../utils/asyncHandler");
const {
    limitePortalPorIp,
    limitePortalPorCuenta,
    limiteRestablecimientoPorIp,
    limiteRestablecimientoPorCuenta
} = require("../middleware/rateLimiters");

router.get("/", portalController.mostrarPortal);
router.post(
    "/login",
    limitePortalPorIp,
    limitePortalPorCuenta,
    asyncHandler(portalController.login)
);

router.get("/restablecer", restablecimientoController.mostrarVerificacion);
router.post(
    "/restablecer",
    limiteRestablecimientoPorIp,
    limiteRestablecimientoPorCuenta,
    asyncHandler(restablecimientoController.verificarContrasenaProvisional)
);
router.get(
    "/restablecer/nueva-contrasena",
    restablecimientoController.mostrarNuevaContrasena
);
router.post(
    "/restablecer/nueva-contrasena",
    asyncHandler(restablecimientoController.guardarNuevaContrasena)
);

module.exports = router;
