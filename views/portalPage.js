function paginaSinMac() {
    return `
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8"><title>Portal ITA</title></head>
        <body>
            <h1>Portal ITA</h1>
            <p>Esta página se debe abrir a través del portal cautivo de la red WiFi.</p>
        </body>
        </html>
    `;
}

function paginaLogin({ clientMac, redirectUrl }) {
    const redirectFinal = redirectUrl || "http://www.msftconnecttest.com/redirect";

    return `
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
                                window.location.href = ${JSON.stringify(redirectFinal)};
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
    `;
}

module.exports = {
    paginaSinMac,
    paginaLogin
};