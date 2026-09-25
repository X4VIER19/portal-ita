const DOMINIO_INSTITUCIONAL = "altamira.tecnm.mx";

function construirCorreoInstitucional(valor) {
    if (typeof valor !== "string") {
        return null;
    }

    const usuario = valor.trim().toLowerCase();

    if (
        !usuario ||
        usuario.length > 64 ||
        usuario.includes("@") ||
        usuario.includes("..") ||
        !/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(usuario)
    ) {
        return null;
    }

    return `${usuario}@${DOMINIO_INSTITUCIONAL}`;
}

module.exports = {
    DOMINIO_INSTITUCIONAL,
    construirCorreoInstitucional
};
