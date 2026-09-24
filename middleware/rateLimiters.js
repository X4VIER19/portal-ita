const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const VENTANA_MS = 30 * 1000; // 15 minutos

/**
 * Clave combinada IP + correo, para el límite "por cuenta".
 * Se usa ipKeyGenerator() (en vez de req.ip directo) porque es la forma
 * recomendada por express-rate-limit para combinar IP con otro dato sin
 * romper la normalización de IPv6 (varias direcciones IPv6 distintas
 * pueden pertenecer al mismo cliente/subred).
 */
function keyPorCuenta(req) {
    const correo = typeof req.body?.correo === "string"
        ? req.body.correo.trim().toLowerCase()
        : "sin-correo";

    return `${ipKeyGenerator(req.ip)}:${correo}`;
}

// ------------------------------------------------------------------
// Login del panel admin (responde renderizando la vista admin/login)
// ------------------------------------------------------------------

const limiteAdminPorIp = rateLimit({
    windowMs: VENTANA_MS,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).render("admin/login", {
            error:
                "Demasiados intentos desde esta red. Espera unos minutos e inténtalo de nuevo."
        });
    }
});

const limiteAdminPorCuenta = rateLimit({
    windowMs: VENTANA_MS,
    limit: 6,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyPorCuenta,
    handler: (req, res) => {
        res.status(429).render("admin/login", {
            error:
                "Demasiados intentos con esta cuenta. Espera unos minutos e inténtalo de nuevo."
        });
    }
});

// ------------------------------------------------------------------
// Login del portal cautivo (responde JSON, se llama vía fetch)
// ------------------------------------------------------------------

const limitePortalPorIp = rateLimit({
    windowMs: VENTANA_MS,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({
            ok: false,
            mensaje:
                "Demasiados intentos desde esta red. Espera unos minutos e inténtalo de nuevo."
        });
    }
});

const limitePortalPorCuenta = rateLimit({
    windowMs: VENTANA_MS,
    limit: 6,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyPorCuenta,
    handler: (req, res) => {
        res.status(429).json({
            ok: false,
            mensaje:
                "Demasiados intentos con esta cuenta. Espera unos minutos e inténtalo de nuevo."
        });
    }
});

module.exports = {
    limiteAdminPorIp,
    limiteAdminPorCuenta,
    limitePortalPorIp,
    limitePortalPorCuenta
};
