const test = require("node:test");
const assert = require("node:assert/strict");

const {
    generarContrasenaProvisional,
    obtenerHorasVigencia,
    calcularExpiracionContrasenaTemporal
} = require("../utils/contrasenaProvisional");

test("genera una contraseña provisional legible de 16 caracteres", () => {
    const contrasena = generarContrasenaProvisional();

    assert.equal(contrasena.length, 16);
    assert.match(contrasena, /^[A-HJ-NP-Za-km-z2-9]+$/);
    assert.match(contrasena, /[A-HJ-NP-Z]/);
    assert.match(contrasena, /[a-km-z]/);
    assert.match(contrasena, /[2-9]/);
    assert.doesNotMatch(contrasena, /[0O1Il]/);
});

test("genera valores diferentes en una muestra", () => {
    const muestra = new Set(
        Array.from({ length: 100 }, () => generarContrasenaProvisional())
    );

    assert.equal(muestra.size, 100);
});

test("rechaza longitudes fuera del intervalo permitido", () => {
    assert.throws(() => generarContrasenaProvisional(11), RangeError);
    assert.throws(() => generarContrasenaProvisional(65), RangeError);
    assert.throws(() => generarContrasenaProvisional(16.5), RangeError);
});

test("usa una vigencia predeterminada de 48 horas", () => {
    assert.equal(obtenerHorasVigencia(undefined), 48);

    const ahora = new Date("2026-09-26T12:00:00.000Z");
    const expiracion = calcularExpiracionContrasenaTemporal(ahora, 48);

    assert.equal(expiracion.toISOString(), "2026-09-28T12:00:00.000Z");
});

test("acepta una vigencia configurable y descarta valores inválidos", () => {
    assert.equal(obtenerHorasVigencia("24"), 24);
    assert.equal(obtenerHorasVigencia("0"), 48);
    assert.equal(obtenerHorasVigencia("texto"), 48);
    assert.equal(obtenerHorasVigencia("169"), 48);
});
