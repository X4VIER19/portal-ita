const express = require("express");
const router = express.Router();

const adminController = require("../controllers/admin.controller");
const { requiereAdmin } = require("../middleware/adminAuth");
const asyncHandler = require("../utils/asyncHandler");

router.get("/", adminController.raizAdmin);
router.get("/login", adminController.mostrarLogin);
router.post("/login", asyncHandler(adminController.login));
router.get("/logout", adminController.logout);

router.get("/inicio", requiereAdmin, asyncHandler(adminController.inicio));

module.exports = router;