const express = require("express");
const router = express.Router();

const portalController = require("../controllers/portal.controller");

router.get("/", portalController.mostrarPortal);
router.post("/login", portalController.login);

router.get("/portal-auth", portalController.autorizarPorUrl);
router.get("/oauth/callback", portalController.oauthCallback);

router.get("/test-auth", portalController.testAuth);
router.get("/test-unauth", portalController.testUnauth);
router.get("/test-omada", portalController.testOmada);

module.exports = router;