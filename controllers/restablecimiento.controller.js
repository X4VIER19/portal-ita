const bcrypt = require("bcrypt");

const {
    buscarUsuarioPorCorreo,
    buscarCredencialUsuarioPorId,
    completarCambioContrasena
} = require("../services/usuarios.service");
const {
    construirCorreoInstitucional
} = require("../utils/correoInstitucional");

const DURACION_AUTORIZACION_MS = 10 * 60 * 1000;

function mostrarVerificacion(req, res) {
    res.render("portal/restablecer", {
        error: null,
        usuario: ""
    });
}

async function regenerarSesion(req) {
    await new Promise((resolve, reject) => {
        req.session.regenerate((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

async function verificarContrasenaProvisional(req, res) {
    const usuarioInstitucional = req.body.usuario;
    const contrasenaProvisional = req.body.contrasenaProvisional;
    const correo = construirCorreoInstitucional(usuarioInstitucional);
    const errorGenerico = "Los datos no son válidos o la contraseña provisional expiró.";

    if (!correo || typeof contrasenaProvisional !== "string" || !contrasenaProvisional) {
        return res.status(400).render("portal/restablecer", {
            error: errorGenerico,
            usuario: usuarioInstitucional || ""
        });
    }

    const usuario = await buscarUsuarioPorCorreo(correo);
    const expiraEn = usuario?.contrasena_temporal_expira_en
        ? new Date(usuario.contrasena_temporal_expira_en)
        : null;
    const credencialVigente = Boolean(
        usuario?.activo &&
        usuario?.requiere_cambio_contrasena &&
        expiraEn &&
        !Number.isNaN(expiraEn.getTime()) &&
        expiraEn.getTime() > Date.now()
    );
    const contrasenaCorrecta = credencialVigente
        ? await bcrypt.compare(contrasenaProvisional, usuario.contrasena_hash)
        : false;

    if (!contrasenaCorrecta) {
        return res.status(401).render("portal/restablecer", {
            error: errorGenerico,
            usuario: usuarioInstitucional || ""
        });
    }

    await regenerarSesion(req);
    req.session.restablecimiento = {
        usuarioId: usuario.id,
        versionCredencial: Number(usuario.version_credencial),
        expiraEn: Date.now() + DURACION_AUTORIZACION_MS
    };

    res.redirect("/restablecer/nueva-contrasena");
}

function obtenerAutorizacionVigente(req) {
    const autorizacion = req.session?.restablecimiento;

    if (!autorizacion || autorizacion.expiraEn <= Date.now()) {
        if (req.session) {
            delete req.session.restablecimiento;
        }
        return null;
    }

    return autorizacion;
}

function mostrarNuevaContrasena(req, res) {
    if (!obtenerAutorizacionVigente(req)) {
        return res.redirect("/restablecer");
    }

    res.render("portal/nueva-contrasena", { error: null });
}

function validarNuevaContrasena(contrasena) {
    if (typeof contrasena !== "string" || contrasena.length < 12 || contrasena.length > 64) {
        return "La nueva contraseña debe tener entre 12 y 64 caracteres.";
    }

    if (Buffer.byteLength(contrasena, "utf8") > 72) {
        return "La nueva contraseña es demasiado larga para procesarse de forma segura.";
    }

    return null;
}

async function guardarNuevaContrasena(req, res) {
    const autorizacion = obtenerAutorizacionVigente(req);
    if (!autorizacion) {
        return res.redirect("/restablecer");
    }

    const { nuevaContrasena, confirmarContrasena } = req.body;
    const errorPolitica = validarNuevaContrasena(nuevaContrasena);

    if (errorPolitica) {
        return res.status(400).render("portal/nueva-contrasena", {
            error: errorPolitica
        });
    }

    if (nuevaContrasena !== confirmarContrasena) {
        return res.status(400).render("portal/nueva-contrasena", {
            error: "Las contraseñas no coinciden."
        });
    }

    const usuario = await buscarCredencialUsuarioPorId(autorizacion.usuarioId);
    const procesoVigente = Boolean(
        usuario?.activo &&
        usuario?.requiere_cambio_contrasena &&
        Number(usuario.version_credencial) === autorizacion.versionCredencial
    );

    if (!procesoVigente) {
        delete req.session.restablecimiento;
        return res.status(409).render("portal/restablecer", {
            error: "El proceso de restablecimiento ya no está vigente. Solicita una nueva contraseña provisional.",
            usuario: ""
        });
    }

    if (await bcrypt.compare(nuevaContrasena, usuario.contrasena_hash)) {
        return res.status(400).render("portal/nueva-contrasena", {
            error: "La nueva contraseña debe ser diferente de la provisional."
        });
    }

    const actualizado = await completarCambioContrasena(
        usuario.id,
        autorizacion.versionCredencial,
        await bcrypt.hash(nuevaContrasena, 10)
    );

    delete req.session.restablecimiento;

    if (!actualizado) {
        return res.status(409).render("portal/restablecer", {
            error: "El proceso venció o fue reemplazado. Solicita una nueva contraseña provisional.",
            usuario: ""
        });
    }

    res.render("portal/contrasena-actualizada");
}

module.exports = {
    mostrarVerificacion,
    verificarContrasenaProvisional,
    mostrarNuevaContrasena,
    guardarNuevaContrasena
};
