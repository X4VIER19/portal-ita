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