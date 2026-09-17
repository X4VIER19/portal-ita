const express = require("express");
const router = express.Router();

const portalController = require("../controllers/portal.controller");
const asyncHandler = require("../utils/asyncHandler");

router.get("/", portalController.mostrarPortal);
router.post("/login", asyncHandler(portalController.login));

router.get("/portal-auth", asyncHandler(portalController.autorizarPorUrl));
router.get("/oauth/callback", portalController.oauthCallback);

router.get("/test-auth", asyncHandler(portalController.testAuth));
router.get("/test-unauth", asyncHandler(portalController.testUnauth));
router.get("/test-omada", asyncHandler(portalController.testOmada));

module.exports = router;