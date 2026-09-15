const express = require("express");
const fs = require("fs");
require("dotenv").config();

const { testAPI, authClient, unauthClient } = require("./services/omada");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const USUARIOS_PRUEBA = [
    {
        correo: "xavier",
        password: "12345678"
    }
];

const sesionesActivas = {};

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

// Página con el formulario de login.
app.get("/", (req, res) => {
    guardarRequest(req);
    const { clientMac, redirectUrl, site, gatewayMac, vid, clientIp } = req.query;

    if (!clientMac) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="es">
            <head><meta charset="UTF-8"><title>Portal ITA</title></head>
            <body>
                <h1>Portal ITA</h1>
                <p>Esta página se debe abrir a través del portal cautivo de la red WiFi.</p>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Portal ITA</title>
            <style>
                body { font-family: sans-serif; display: flex; align-items: center;
                       justify-content: center; height: 100vh; margin: 0; background: #f4f4f4; }
                .card { background: white; padding: 2rem 3rem; border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; width: 300px; }
                input { width: 100%; padding: 0.6rem; margin: 0.4rem 0; box-sizing: border-box; }
                button { margin-top: 1rem; padding: 0.75rem 2rem; font-size: 1rem;
                         background: #2ecc71; color: white; border: none; border-radius: 6px; cursor: pointer; width: 100%; }
                button:disabled { background: #95a5a6; }
                #mensaje { margin-top: 1rem; font-size: 0.9rem; color: #555; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Portal ITA</h1>
                <p>Dispositivo: <strong>${clientMac}</strong></p>
                <input id="correo" type="email" placeholder="correo@altamira.tecnm.mx">
                <input id="password" type="password" placeholder="Contraseña">
                <button id="btnLogin" onclick="login()">Acceder</button>
                <div id="mensaje"></div>
            </div>
            <script>
                async function login() {
                    const boton = document.getElementById("btnLogin");
                    const mensaje = document.getElementById("mensaje");
                    const correo = document.getElementById("correo").value;
                    const password = document.getElementById("password").value;

                    boton.disabled = true;
                    boton.innerText = "Verificando...";
                    mensaje.innerText = "";

                    try {
                        const resp = await fetch("/login", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                correo, password,
                                clientMac: ${JSON.stringify(clientMac)}
                            })
                        });
                        const data = await resp.json();

                        if (data.ok) {
                            mensaje.innerText = "Acceso concedido. Redirigiendo...";
                            setTimeout(() => {
                                window.location.href = ${JSON.stringify(redirectUrl || "http://www.msftconnecttest.com/redirect")};
                            }, 1000);
                        } else {
                            mensaje.innerText = data.mensaje;
                            boton.disabled = false;
                            boton.innerText = "Acceder";
                        }
                    } catch (err) {
                        mensaje.innerText = "Error de conexión con el servidor.";
                        boton.disabled = false;
                        boton.innerText = "Acceder";
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Valida credenciales y aplica la regla de 1 MAC por usuario.
app.post("/login", async (req, res) => {
    const { correo, password, clientMac } = req.body;

    if (!correo || !password || !clientMac) {
        return res.status(400).json({ ok: false, mensaje: "Faltan datos." });
    }

    const usuario = USUARIOS_PRUEBA.find(u => u.correo === correo);
    if (!usuario) {
        return res.json({ ok: false, mensaje: "Usuario no encontrado." });
    }

    // Validación en texto plano (sin bcrypt) -- SOLO PRUEBA, corregir antes de BD real
    if (password !== usuario.password) {
        return res.json({ ok: false, mensaje: "Contraseña incorrecta." });
    }

    // --- Lógica de 1 MAC por usuario ---
    const sesionPrevia = sesionesActivas[correo];

    if (sesionPrevia && sesionPrevia.mac !== clientMac) {
        console.log(`Usuario ${correo} cambia de MAC: ${sesionPrevia.mac} -> ${clientMac}`);
        await unauthClient(sesionPrevia.mac);
    } else if (sesionPrevia && sesionPrevia.mac === clientMac) {
        console.log(`Usuario ${correo} vuelve a loguearse desde la misma MAC.`);
    }

    const resultado = await authClient(clientMac);

    if (resultado.errorCode !== 0) {
        return res.json({ ok: false, mensaje: "Error al autorizar: " + resultado.msg });
    }

    sesionesActivas[correo] = {
        mac: clientMac,
        autorizadoEn: new Date().toISOString()
    };

    console.log("Sesiones activas actuales:", sesionesActivas);

    res.json({ ok: true, mensaje: "Acceso concedido." });
});

// Endpoint por si necesitas autorizar directo por URL
app.get("/portal-auth", async (req, res) => {
    const mac = req.query.mac;
    if (!mac) {
        return res.status(400).json({ errorCode: -1, msg: "Falta el parámetro mac" });
    }
    const resultado = await authClient(mac);
    res.json(resultado);
});

// --------------------------------------------------------------
// RUTAS DE PRUEBA MANUAL
// --------------------------------------------------------------
app.get("/test-auth", async (req, res) => {
    const mac = req.query.mac;
    if (!mac) {
        return res.status(400).json({ error: "Falta el parámetro ?mac=" });
    }
    const resultado = await authClient(mac);
    res.json(resultado);
});

app.get("/test-unauth", async (req, res) => {
    const mac = req.query.mac;
    if (!mac) {
        return res.status(400).json({ error: "Falta el parámetro ?mac=" });
    }
    const resultado = await unauthClient(mac);
    res.json(resultado);
});

app.get("/test-omada", async (req, res) => {
    console.log("Entrando a prueba Omada");
    const token = await testAPI();
    res.json({
        mensaje: "Ruta funcionando",
        respuesta: token
    });
});

app.get("/oauth/callback", (req, res) => {
    console.log("\n================================");
    console.log("OAUTH CALLBACK RECIBIDO");
    console.log("================================");
    console.log("Query:", req.query);
    console.log("================================\n");

    res.json({
        mensaje: "Callback recibido",
        query: req.query
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("--------------------------------");
    console.log("PORTAL ITA - SERVER (login en texto plano)");
    console.log("--------------------------------");
    console.log(`Puerto: ${PORT}`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log("--------------------------------");
});