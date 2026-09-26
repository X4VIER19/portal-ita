const express = require("express");
const router = express.Router();

const portalController = require("../controllers/portal.controller");
const asyncHandler = require("../utils/asyncHandler");
const {
    limitePortalPorIp,
    limitePortalPorCuenta
} = require("../middleware/rateLimiters");

router.get("/", portalController.mostrarPortal);
router.post(
    "/login",
    limitePortalPorIp,
    limitePortalPorCuenta,
    asyncHandler(portalController.login)
);

module.exports = router;
