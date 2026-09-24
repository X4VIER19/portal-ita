const fs = require("fs");
const bcrypt = require("bcrypt");

const {
    authClient,
    unauthClient,
    unauthEfectivo,
    obtenerSsidCliente,
    testAPI
} = require("../services/omada");

const {
    buscarUsuarioPorCorreo,
    buscarSesionActiva,
    guardarSesionActiva
} = require("../services/usuarios.service");

const {
    buscarSsidActivoPorNombre,
    registrarSsidDesconocido
} = require("../services/ssids.service");

const { esCompatible } = require("../utils/compatibilidadSsid");

function normalizarMac(mac) {
    if (typeof mac !== "string") {
        return null;
    }

    const macLimpia = mac.trim().toUpperCase();

    const macValida = /^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(macLimpia);

    if (!macValida) {
        return null;
    }

    return macLimpia.replace(/:/g, "-");
}

function validarRedirectUrl(url) {
    if (typeof url !== "string" || !url.trim()) {
        return "http://sii.altamira.tecnm.mx/";
    }

    try {
        const destino = new URL(url);

        if (destino.protocol !== "http:" && destino.protocol !== "https:") {
            return "http://sii.altamira.tecnm.mx/";
        }

        return destino.toString();
    } catch {
        return "http://sii.altamira.tecnm.mx/";
    }
}

const locksUsuarios = new Map();

async function adquirirLockUsuario(usuarioId) {
    while (locksUsuarios.has(usuarioId)) {
        await locksUsuarios.get(usuarioId);
    }

    let liberar;
    const promesa = new Promise((resolve) => {
        liberar = resolve;
    });

    locksUsuarios.set(usuarioId, promesa);

    return () => {
        if (locksUsuarios.get(usuarioId) === promesa) {
            locksUsuarios.delete(usuarioId);
            liberar();
        }
    };
}

function guardarRequest(req) {
    const data = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        query: req.query,
        headers: req.headers,
        body: req.body
    };

    fs.appendFileSync(
        "omada-capturas.json",
        JSON.stringify(data, null, 2) + ",\n",
        "utf8"
    );

    return data;
}

async function cambiarSesionConCompensacion(usuarioId, macAnterior, macNueva) {
    console.log(
        `Cambio de sesión: usuario ${usuarioId} ` +
        `${macAnterior} -> ${macNueva}`
    );

    // Si la MAC no cambió, no necesitamos tocar Omada.
    if (macAnterior === macNueva) {
        await guardarSesionActiva(usuarioId, macNueva);

        return {
            ok: true,
            etapa: "misma_mac"
        };
    }

    // ---------------------------------------------------------
    // 1. UNAUTH de la MAC anterior
    // ---------------------------------------------------------

    let resultadoUnauth;

    try {
        resultadoUnauth = await unauthClient(macAnterior);
    } catch (error) {
        console.error(
            `Error de red al desautorizar ${macAnterior}:`,
            error.message
        );
        return {
            ok: false,
            etapa: "unauth_anterior",
            ambiguo: true,
            mensaje: "No se pudo determinar el estado de la sesión anterior."
        };
    }

    if (!unauthEfectivo(resultadoUnauth)) {
        console.error(
            `No se pudo desautorizar ${macAnterior}:`,
            resultadoUnauth
        );

        return {
            ok: false,
            etapa: "unauth_anterior",
            ambiguo: false,
            mensaje: "No se pudo cerrar la sesión anterior."
        };
    }

    // ---------------------------------------------------------
    // 2. AUTH de la MAC nueva
    // ---------------------------------------------------------

    let resultadoAuth;

    try {
        resultadoAuth = await authClient(macNueva);
    } catch (error) {
        console.error(
            `Error de red al autorizar ${macNueva}:`,
            error.message
        );

        return {
            ok: false,
            etapa: "auth_nueva",
            ambiguo: true,
            mensaje: "No se pudo determinar el estado de la nueva autorización."
        };
    }

    if (resultadoAuth.errorCode !== 0) {
        console.error(
            `Falló AUTH de ${macNueva}:`,
            resultadoAuth
        );

        let restauracion;
        try {
            restauracion = await authClient(macAnterior);
        } catch (error) {
            restauracion = {
                ok: false,
                ambiguo: true,
                mensaje: error.message
            };
        }

        return {
            ok: false,
            etapa: "auth_nueva",
            ambiguo: false,
            mensaje: "No se pudo autorizar la nueva sesión.",
            resultadoAuth,
            restauracion
        };
    }

    // ---------------------------------------------------------
    // 3. Guardar la nueva MAC en MySQL
    // ---------------------------------------------------------

    try {
        await guardarSesionActiva(usuarioId, macNueva);

    } catch (error) {
        console.error(
            `ERROR MYSQL al guardar ${macNueva}:`,
            error.message
        );

        // MySQL falló después de que Omada autorizó la nueva MAC.
        // Intentamos compensar el cambio en Omada.

        let compensacionNueva;
        let restauracionAnterior;

        try {
            compensacionNueva = await unauthClient(macNueva);
        } catch (errorCompensacion) {
            compensacionNueva = {
                ok: false,
                ambiguo: true,
                mensaje: errorCompensacion.message
            };
        }

        try {
            restauracionAnterior = await authClient(macAnterior);
        } catch (errorRestauracion) {
            restauracionAnterior = {
                ok: false,
                ambiguo: true,
                mensaje: errorRestauracion.message
            };
        }

        return {
            ok: false,
            etapa: "mysql",
            ambiguo: true,
            mensaje: "No se pudo guardar la nueva sesión en MySQL.",
            compensacionNueva,
            restauracionAnterior
        };
    }

    return {
        ok: true,
        etapa: "completado"
    };
}

// GET /  -> Página que ve el cliente al ser redirigido por Omada.
function mostrarPortal(req, res) {
    guardarRequest(req);

    const clientMac = normalizarMac(req.query.clientMac);
    const redirectUrl = validarRedirectUrl(req.query.redirectUrl);

    if (!clientMac) {
        return res.render("portal/sinMac");
    }

    if (!req.session.clientMac) {
        req.session.clientMac = clientMac;
    }

    // Nota de diseño: el SSID de origen NO se resuelve ni se valida aquí.
    // Se resuelve en POST /login, justo antes de autorizar en Omada, para
    // usar el dato más reciente posible (ver scripts/test-ssid-preauth.js
    // y la bitácora del proyecto para el sustento de esta decisión).

    res.render("portal/login", {
        clientMac: req.session.clientMac,
        redirectUrl
    });
}


// POST /login -> Valida credenciales, SSID de origen y aplica la regla
// de 1 MAC por usuario.
async function login(req, res) {
    const { correo, password } = req.body;
    const clientMac = req.session.clientMac;

    if (!clientMac) {
        return res.status(400).json({
            ok: false,
            mensaje: "Sesión del portal inválida o expirada."
        });
    }

    if (!correo || !password) {
        return res.status(400).json({
            ok: false,
            mensaje: "Faltan datos."
        });
    }

    const usuario = await buscarUsuarioPorCorreo(correo);
    if (!usuario) {
        return res.json({
            ok: false,
            mensaje: "Usuario no encontrado."
        });
    }

    if (!usuario.activo) {
        return res.json({
            ok: false,
            mensaje: "La cuenta está desactivada."
        });
    }

    const passwordCorrecta = await bcrypt.compare(
        password,
        usuario.contrasena_hash
    );

    if (!passwordCorrecta) {
        return res.json({
            ok: false,
            mensaje: "Contraseña incorrecta."
        });
    }

    // ---------------------------------------------------------
    // Validación de SSID de origen contra el rol del usuario.
    // Se hace ANTES de tocar Omada o sesiones_activas: si el
    // usuario no puede usar esta red, no debe generarse ningún
    // cambio de estado en Omada ni en MySQL.
    //
    // Mensaje al usuario: intencionalmente genérico e idéntico
    // en ambos casos de rechazo (SSID no registrado / SSID
    // incompatible con el rol), para no revelar la arquitectura
    // de red. El detalle real queda solo en el log del servidor.
    // ---------------------------------------------------------

    const ssid = await obtenerSsidCliente(clientMac);

    if (!ssid) {
        console.error(
            `No se pudo determinar el SSID de origen para ${clientMac} ` +
            `(usuario intentando ingresar: ${correo}).`
        );

        return res.json({
            ok: false,
            mensaje:
                "No se pudo verificar tu red. Reconéctate al WiFi e inténtalo de nuevo."
        });
    }

    const ssidConfigurado = await buscarSsidActivoPorNombre(ssid);

    if (!ssidConfigurado) {
        console.error(
            `Intento de login desde SSID no registrado: "${ssid}" ` +
            `(mac=${clientMac}, correo=${correo}).`
        );

        try {
            await registrarSsidDesconocido(ssid);
        } catch (error) {
            console.error(
                "No se pudo registrar el SSID desconocido:",
                error.message
            );
        }

        return res.json({
            ok: false,
            mensaje: "No tienes acceso a Internet desde esta red."
        });
    }

    if (!esCompatible(ssidConfigurado.tipo, usuario.rol)) {
        console.error(
            `Rol incompatible con el SSID: usuario ${correo} (rol=${usuario.rol}) ` +
            `intentó autenticarse desde "${ssid}" (tipo=${ssidConfigurado.tipo}).`
        );

        return res.json({
            ok: false,
            mensaje: "No tienes acceso a Internet desde esta red."
        });
    }

    // ---------------------------------------------------------
    // Fin de la validación de SSID. A partir de aquí, el flujo
    // es exactamente el mismo que ya estaba probado.
    // ---------------------------------------------------------

    const liberarLock = await adquirirLockUsuario(usuario.id);

    try {
        const sesionPrevia = await buscarSesionActiva(usuario.id);

        if (!sesionPrevia) {
            // Primera sesión del usuario.
            let resultadoAuth;

            try {
                resultadoAuth = await authClient(clientMac);
            } catch (error) {
                console.error(
                    `Error de red al autorizar ${clientMac}:`,
                    error.message
                );

                return res.json({
                    ok: false,
                    mensaje: "No se pudo determinar el estado de la autorización."
                });
            }

            if (resultadoAuth.errorCode !== 0) {
                return res.json({
                    ok: false,
                    mensaje: "Error al autorizar: " + resultadoAuth.msg
                });
            }

            try {
                await guardarSesionActiva(
                    usuario.id,
                    clientMac
                );
            } catch (error) {
                console.error(
                    `ERROR MYSQL al guardar ${clientMac}:`,
                    error.message
                );

                try {
                    await unauthClient(clientMac);
                } catch (errorCompensacion) {
                    console.error(
                        "No se pudo compensar AUTH nueva:",
                        errorCompensacion.message
                    );
                }

                return res.json({
                    ok: false,
                    mensaje: "No se pudo guardar la sesión."
                });
            }

        } else if (sesionPrevia.mac === clientMac) {
            // El usuario ya tiene esta misma MAC autorizada.
            // No necesitamos cambiar nada en Omada.

            console.log(
                `Usuario ${correo} ya tiene activa la MAC ${clientMac}.`
            );

        } else {
            // Cambio de dispositivo.
            const resultadoCambio = await cambiarSesionConCompensacion(
                usuario.id,
                sesionPrevia.mac,
                clientMac
            );

            if (!resultadoCambio.ok) {
                console.error(
                    "No se pudo completar el cambio de sesión:",
                    resultadoCambio
                );

                return res.json({
                    ok: false,
                    mensaje: resultadoCambio.mensaje ||
                        "No se pudo cambiar la sesión."
                });
            }
        }

        console.log(
            `Sesión activa: usuario ${usuario.id} ` +
            `(${correo}) -> ${clientMac} (ssid=${ssid})`
        );

        return res.json({
            ok: true,
            mensaje: "Acceso concedido."
        });

    } finally {
        liberarLock();
    }
}

// GET /portal-auth?mac=... -> Autorizar directo por URL (uso manual)
async function autorizarPorUrl(req, res) {
    const mac = req.query.mac;
    if (!mac) {
        return res.status(400).json({ errorCode: -1, msg: "Falta el parámetro mac" });
    }
    const resultado = await authClient(mac);
    res.json(resultado);
}

// GET /test-auth?mac=...
async function testAuth(req, res) {
    const mac = req.query.mac;
    if (!mac) {
        return res.status(400).json({ error: "Falta el parámetro ?mac=" });
    }
    const resultado = await authClient(mac);
    res.json(resultado);
}

// GET /test-unauth?mac=...
async function testUnauth(req, res) {
    const mac = req.query.mac;
    if (!mac) {
        return res.status(400).json({ error: "Falta el parámetro ?mac=" });
    }
    const resultado = await unauthClient(mac);
    res.json(resultado);
}

// GET /test-omada
async function testOmada(req, res) {
    console.log("Entrando a prueba Omada");
    const token = await testAPI();
    res.json({ mensaje: "Ruta funcionando", respuesta: token });
}

// GET /oauth/callback
function oauthCallback(req, res) {
    console.log("=== OAUTH CALLBACK RECIBIDO ===");
    console.log("Query:", req.query);
    console.log("================================\n");

    res.json({ mensaje: "Callback recibido", query: req.query });
}

module.exports = {
    mostrarPortal,
    login,
    autorizarPorUrl,
    testAuth,
    testUnauth,
    testOmada,
    oauthCallback
};
