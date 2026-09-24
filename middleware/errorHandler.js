const { invalidCsrfTokenError } = require("./csrf");

function mensajeAmigable(err) {
    if (err.code === "ECONNREFUSED" || err.name === "AggregateError") {
        return "No se pudo conectar a la base de datos. Verifica que el contenedor de MySQL esté corriendo (docker compose ps).";
    }

    if (err.code === "ER_NO_SUCH_TABLE" || err.code === "ER_BAD_FIELD_ERROR") {
        return "Hay un problema con la estructura de la base de datos. Revisa que init.sql esté aplicado correctamente.";
    }

    if (err.code === "ER_ACCESS_DENIED_ERROR") {
        return "No se pudo autenticar contra la base de datos. Revisa las credenciales en tu .env.";
    }

    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
        return "El Omada Controller no respondió a tiempo. Verifica que esté encendido y accesible en la red.";
    }

    return "Ocurrió un error inesperado. Si el problema persiste, revisa la consola del servidor para más detalle.";
}


function errorHandler(err, req, res, next) {
    // ------------------------------------------------------------
    // NUEVO: token CSRF inválido o ausente.
    // Se compara por identidad porque csrf-sync reutiliza una misma
    // instancia de error para todos los rechazos de validación.
    // Casos típicos: formulario abierto en una pestaña vieja después
    // de que la sesión expiró, o un intento real de CSRF.
    // ------------------------------------------------------------
    if (err === invalidCsrfTokenError) {
        console.error("=== CSRF RECHAZADO ===");
        console.error(`Ruta: ${req.method} ${req.originalUrl}`);
        console.error(`IP: ${req.ip}`);
        console.error("=======================");

        if (req.originalUrl.startsWith("/admin")) {
            return res.status(403).render("admin/error", {
                mensaje:
                    "Tu sesión de formulario expiró o no es válida. Recarga la página e inténtalo de nuevo."
            });
        }

        return res.status(403).json({
            ok: false,
            mensaje: "Tu sesión expiró. Recarga la página e inténtalo de nuevo."
        });
    }

    console.error("=== ERROR ===");
    console.error(err);
    console.error("=============");

    const mensaje = mensajeAmigable(err);

    if (req.originalUrl.startsWith("/admin")) {
        return res.status(500).render("admin/error", { mensaje });
    }

    res.status(500).json({ ok: false, mensaje });
}

module.exports = errorHandler;
