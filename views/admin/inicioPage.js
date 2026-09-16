function paginaInicioAdmin({ nombre, apellido, rol }) {
    return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Inicio — Portal ITA</title>
            <link rel="stylesheet" href="/styles/tokens.css">
            <style>
                body {
                    font-family: sans-serif;
                    margin: 0;
                    background: var(--color-fondo-app);
                    color: var(--color-texto-normal);
                    padding: 2rem;
                }
                h1 { color: var(--color-texto-titulo); }
                p { color: var(--color-texto-tenue); }
            </style>
        </head>
        <body>
            <h1>Bienvenido, ${nombre} ${apellido}</h1>
            <p>Rol: ${rol}</p>
        </body>
        </html>
    `;
}

module.exports = { paginaInicioAdmin };