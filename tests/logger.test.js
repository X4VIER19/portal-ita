const test = require("node:test");
const assert = require("node:assert/strict");

const {
    crearLogger,
    enmascararMac,
    sanitizarValor
} = require("../utils/logger");

test("sanitiza secretos y MAC incluso dentro de objetos", () => {
    const resultado = sanitizarValor({
        authorization: "AccessToken=secreto",
        client_secret: "secreto-cliente",
        OMADA_CLIENT_SECRET: "secreto-entorno",
        nested: {
            accessToken: "token",
            refreshTokenAvailable: true,
            clientMac: "78:8c:b5:d4:01:a3"
        },
        errorCode: -41009
    });

    assert.equal(resultado.authorization, "[REDACTADO]");
    assert.equal(resultado.client_secret, "[REDACTADO]");
    assert.equal(resultado.OMADA_CLIENT_SECRET, "[REDACTADO]");
    assert.equal(resultado.nested.accessToken, "[REDACTADO]");
    assert.equal(resultado.nested.refreshTokenAvailable, "[REDACTADO]");
    assert.equal(resultado.nested.clientMac, "78-8C-B5-XX-XX-A3");
    assert.equal(resultado.errorCode, -41009);
});

test("enmascara MAC con guiones o dos puntos", () => {
    assert.equal(enmascararMac("AA-BB-CC-DD-EE-FF"), "AA-BB-CC-XX-XX-FF");
    assert.equal(enmascararMac("aa:bb:cc:dd:ee:ff"), "AA-BB-CC-XX-XX-FF");
});

test("respeta el nivel configurado y genera JSON", () => {
    const lineas = [];
    const salida = {
        log: (linea) => lineas.push(linea),
        warn: (linea) => lineas.push(linea),
        error: (linea) => lineas.push(linea)
    };
    const logger = crearLogger({ nivel: "warn", salida });

    logger.debug("evento.debug");
    logger.info("evento.info");
    logger.warn("evento.warn", { clientMac: "AA-BB-CC-DD-EE-FF" });
    logger.error("evento.error", { password: "no-visible" });

    assert.equal(lineas.length, 2);
    assert.deepEqual(
        lineas.map((linea) => JSON.parse(linea).event),
        ["evento.warn", "evento.error"]
    );
    assert.equal(JSON.parse(lineas[0]).clientMac, "AA-BB-CC-XX-XX-FF");
    assert.equal(JSON.parse(lineas[1]).password, "[REDACTADO]");
});

test("usa info cuando LOG_LEVEL no es válido", () => {
    const lineas = [];
    const salida = {
        log: (linea) => lineas.push(linea),
        warn: (linea) => lineas.push(linea),
        error: (linea) => lineas.push(linea)
    };
    const logger = crearLogger({ nivel: "desconocido", salida });

    logger.debug("evento.debug");
    logger.info("evento.info");

    assert.equal(lineas.length, 1);
    assert.equal(JSON.parse(lineas[0]).event, "evento.info");
});
