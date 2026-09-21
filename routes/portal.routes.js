const express = require("express");
const router = express.Router();

const portalController = require("../controllers/portal.controller");
const asyncHandler = require("../utils/asyncHandler");

router.get("/", portalController.mostrarPortal);
router.post("/login", asyncHandler(portalController.login));

router.get("/oauth/callback", portalController.oauthCallback);

module.exports = router;