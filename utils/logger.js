const NIVELES = Object.freeze({
    debug: 10,
    info: 20,
    warn: 30,
    error: 40
});

const PATRON_CAMPO_SENSIBLE = /(authorization|cookie|password|contrasena|secret|token)/i;

function normalizarNombreCampo(campo) {
    return String(campo || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function normalizarNivel(nivel) {
    const valor = String(nivel || "").toLowerCase();
    return Object.hasOwn(NIVELES, valor) ? valor : "info";
}

function enmascararMac(valor) {
    if (typeof valor !== "string") {
        return valor;
    }

    const partes = valor.trim().split(/[:-]/);
    if (partes.length !== 6 || partes.some((parte) => !/^[0-9a-f]{2}$/i.test(parte))) {
        return valor;
    }

    return `${partes[0].toUpperCase()}-${partes[1].toUpperCase()}-${partes[2].toUpperCase()}-XX-XX-${partes[5].toUpperCase()}`;
}

function sanitizarValor(valor, campo = "", visitados = new WeakSet()) {
    const nombreCampo = normalizarNombreCampo(campo);

    if (PATRON_CAMPO_SENSIBLE.test(nombreCampo)) {
        return "[REDACTADO]";
    }

    if (nombreCampo.includes("mac")) {
        return enmascararMac(valor);
    }

    if (valor instanceof Error) {
        return sanitizarValor({
            name: valor.name,
            message: valor.message,
            code: valor.code
        }, campo, visitados);
    }

    if (Array.isArray(valor)) {
        return valor.map((elemento) => sanitizarValor(elemento, campo, visitados));
    }

    if (valor && typeof valor === "object") {
        if (visitados.has(valor)) {
            return "[CIRCULAR]";
        }

        visitados.add(valor);

        const resultado = {};
        for (const [clave, contenido] of Object.entries(valor)) {
            resultado[clave] = sanitizarValor(contenido, clave, visitados);
        }

        visitados.delete(valor);
        return resultado;
    }

    return valor;
}

function crearLogger({ nivel = process.env.LOG_LEVEL, salida = console } = {}) {
    const nivelConfigurado = normalizarNivel(nivel);

    function registrar(nivelEvento, evento, contexto = {}) {
        if (NIVELES[nivelEvento] < NIVELES[nivelConfigurado]) {
            return;
        }

        const registro = sanitizarValor({
            timestamp: new Date().toISOString(),
            level: nivelEvento,
            event: evento,
            ...contexto
        });
        const linea = JSON.stringify(registro);
        const metodo = nivelEvento === "error"
            ? "error"
            : nivelEvento === "warn"
                ? "warn"
                : "log";

        salida[metodo](linea);
    }

    return {
        debug: (evento, contexto) => registrar("debug", evento, contexto),
        info: (evento, contexto) => registrar("info", evento, contexto),
        warn: (evento, contexto) => registrar("warn", evento, contexto),
        error: (evento, contexto) => registrar("error", evento, contexto)
    };
}

const logger = crearLogger();

module.exports = {
    ...logger,
    crearLogger,
    enmascararMac,
    sanitizarValor
};
