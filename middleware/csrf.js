const { csrfSync } = require("csrf-sync");

/**
 * Protección CSRF centralizada (patrón Synchronizer Token).
 *
 * Se eligió csrf-sync sobre csrf-csrf porque este proyecto usa
 * express-session con estado del lado del servidor (no es una SPA sin
 * estado) — csrf-sync es la opción recomendada explícitamente por el
 * propio ecosistema para este caso. csurf quedó descartado por estar
 * archivado y sin mantenimiento oficial desde 2025.
 *
 * getTokenFromRequest revisa dos lugares porque el proyecto mezcla dos
 * formas de enviar datos al servidor:
 *   - Formularios EJS clásicos (POST con body urlencoded)  -> req.body._csrf
 *   - Peticiones fetch/AJAX (modal de usuarios, login del portal)
 *     -> header X-CSRF-Token
 */
const {
    csrfSynchronisedProtection,
    generateToken,
    invalidCsrfTokenError
} = csrfSync({
    getTokenFromRequest: (req) => {
        return req.body?._csrf || req.headers["x-csrf-token"];
    }
});

/**
 * Middleware global: asegura que exista un token CSRF para la sesión
 * actual y lo expone en res.locals para que CUALQUIER vista EJS pueda
 * usar <%= csrfToken %> sin que cada controlador tenga que pasarlo
 * explícitamente en cada render().
 *
 * generateToken() por defecto no sobreescribe un token ya existente en
 * sesión, así que llamarlo en cada request es seguro e idempotente.
 */
function attachCsrfToken(req, res, next) {
    res.locals.csrfToken = generateToken(req);
    next();
}

module.exports = {
    csrfSynchronisedProtection,
    attachCsrfToken,
    invalidCsrfTokenError
};
