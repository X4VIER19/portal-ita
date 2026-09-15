const fs = require("fs");
const bcrypt = require("bcrypt");

const { authClient, unauthClient, testAPI } = require("../services/omada");
const {
    buscarUsuarioPorCorreo,
    buscarSesionActiva,
    guardarSesionActiva
} = require("../services/usuarios.service");
const { paginaSinMac, paginaLogin } = require("../views/portalPage");

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

// GET /  -> Página que ve el cliente al ser redirigido por Omada.
function mostrarPortal(req, res) {
    guardarRequest(req);
    const { clientMac, redirectUrl } = req.query;

    if (!clientMac) {
        return res.send(paginaSinMac());
    }

    res.send(paginaLogin({ clientMac, redirectUrl }));
}

// POST /login -> Valida credenciales y aplica la regla de 1 MAC por usuario.
async function login(req, res) {
    const { correo, password, clientMac } = req.body;

    if (!correo || !password || !clientMac) {
        return res.status(400).json({ ok: false, mensaje: "Faltan datos." });
    }

    const usuario = await buscarUsuarioPorCorreo(correo);
    if (!usuario) {
        return res.json({ ok: false, mensaje: "Usuario no encontrado." });
    }

    if (!usuario.activo) {
        return res.json({ ok: false, mensaje: "La cuenta está desactivada." });
    }

    const passwordCorrecta = await bcrypt.compare(password, usuario.contrasena_hash);
    if (!passwordCorrecta) {
        return res.json({ ok: false, mensaje: "Contraseña incorrecta." });
    }

    const sesionPrevia = await buscarSesionActiva(usuario.id);

    if (sesionPrevia && sesionPrevia.mac !== clientMac) {
        console.log(`Usuario ${correo} cambia de MAC: ${sesionPrevia.mac} -> ${clientMac}`);

        const resultadoUnauth = await unauthClient(sesionPrevia.mac);
        if (resultadoUnauth.errorCode !== 0) {
            console.error(`No se pudo desautorizar la MAC anterior ${sesionPrevia.mac}:`, resultadoUnauth);
            return res.json({ ok: false, mensaje: "No se pudo cerrar la sesión anterior." });
        }
    }

    const resultado = await authClient(clientMac);
    if (resultado.errorCode !== 0) {
        return res.json({ ok: false, mensaje: "Error al autorizar: " + resultado.msg });
    }

    await guardarSesionActiva(usuario.id, clientMac);
    console.log(`Sesión activa: usuario ${usuario.id} (${correo}) -> ${clientMac}`);

    res.json({ ok: true, mensaje: "Acceso concedido." });
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
    console.log("\n================================");
    console.log("OAUTH CALLBACK RECIBIDO");
    console.log("================================");
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