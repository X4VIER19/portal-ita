const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
require("dotenv").config();

const portalIp = process.env.PORTAL_IP;

if (!portalIp) {
    console.error("ERROR: PORTAL_IP no está definida en el archivo .env");
    process.exit(1);
}

const certsDir = path.join(__dirname, "..", "certs");
const configPath = path.join(certsDir, "openssl.cnf");
const keyPath = path.join(certsDir, "server.key");
const certPath = path.join(certsDir, "server.crt");

fs.mkdirSync(certsDir, { recursive: true });

const opensslConfig = `[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
C = MX
ST = Estado
L = Ciudad
O = Instituto
OU = Infraestructura de Red
CN = ${portalIp}

[v3_req]
subjectAltName = @alt_names

[alt_names]
IP.1 = ${portalIp}
`;

fs.writeFileSync(configPath, opensslConfig, "utf8");

console.log(`🔐 Generando certificado para ${portalIp}...`);

try {
    execSync(
        `openssl req -new -x509 -nodes -days 365 -newkey rsa:2048 ` +
        `-keyout "${keyPath}" ` +
        `-out "${certPath}" ` +
        `-config "${configPath}"`,
        { stdio: "inherit" }
    );

    console.log("\nCertificado generado correctamente.");
    console.log(`   IP:          ${portalIp}`);
    console.log(`   Certificado: ${certPath}`);
    console.log(`   Clave:       ${keyPath}`);
} catch (error) {
    console.error("\nError al ejecutar OpenSSL.");
    console.error("Comprueba que OpenSSL esté instalado y disponible en PATH.");
    process.exit(1);
}