const crypto = require("crypto");

const LONGITUD_PREDETERMINADA = 16;
const HORAS_VIGENCIA_PREDETERMINADAS = 48;
const LONGITUD_MINIMA = 12;
const LONGITUD_MAXIMA = 64;

// Se excluyen 0, O, 1, I y l para reducir errores al copiar la contraseña.
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const NUMEROS = "23456789";
const ALFABETO = `${MAYUSCULAS}${MINUSCULAS}${NUMEROS}`;

function caracterAleatorio(alfabeto) {
    return alfabeto[crypto.randomInt(0, alfabeto.length)];
}

function mezclarCaracteres(caracteres) {
    for (let indice = caracteres.length - 1; indice > 0; indice--) {
        const posicion = crypto.randomInt(0, indice + 1);
        [caracteres[indice], caracteres[posicion]] = [
            caracteres[posicion],
            caracteres[indice]
        ];
    }

    return caracteres.join("");
}

function generarContrasenaProvisional(longitud = LONGITUD_PREDETERMINADA) {
    if (!Number.isInteger(longitud) || longitud < LONGITUD_MINIMA || longitud > LONGITUD_MAXIMA) {
        throw new RangeError(
            `La longitud debe ser un entero entre ${LONGITUD_MINIMA} y ${LONGITUD_MAXIMA}.`
        );
    }

    const caracteres = [
        caracterAleatorio(MAYUSCULAS),
        caracterAleatorio(MINUSCULAS),
        caracterAleatorio(NUMEROS)
    ];

    while (caracteres.length < longitud) {
        caracteres.push(caracterAleatorio(ALFABETO));
    }

    return mezclarCaracteres(caracteres);
}

function obtenerHorasVigencia(valor = process.env.TEMP_PASSWORD_TTL_HOURS) {
    if (valor === undefined || valor === "") {
        return HORAS_VIGENCIA_PREDETERMINADAS;
    }

    const horas = Number(valor);
    if (!Number.isInteger(horas) || horas < 1 || horas > 168) {
        return HORAS_VIGENCIA_PREDETERMINADAS;
    }

    return horas;
}

function calcularExpiracionContrasenaTemporal(
    ahora = new Date(),
    horasVigencia = obtenerHorasVigencia()
) {
    if (!(ahora instanceof Date) || Number.isNaN(ahora.getTime())) {
        throw new TypeError("La fecha actual no es válida.");
    }

    if (!Number.isInteger(horasVigencia) || horasVigencia < 1 || horasVigencia > 168) {
        throw new RangeError("La vigencia debe ser un entero entre 1 y 168 horas.");
    }

    return new Date(ahora.getTime() + horasVigencia * 60 * 60 * 1000);
}

module.exports = {
    generarContrasenaProvisional,
    obtenerHorasVigencia,
    calcularExpiracionContrasenaTemporal,
    LONGITUD_PREDETERMINADA,
    HORAS_VIGENCIA_PREDETERMINADAS
};
