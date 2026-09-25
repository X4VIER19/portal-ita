# Portal Cautivo ITA

Portal cautivo externo para la red del Instituto Tecnológico de Altamira, integrado con **TP-Link Omada** y **MySQL**. Permite autenticar usuarios institucionales, aplicar el acceso según el tipo de SSID y administrar sesiones desde un panel web.

> Este repositorio está orientado al entorno de laboratorio. Antes de utilizarlo en producción, revisa la configuración de red, certificados HTTPS, secretos y políticas de acceso.

## Funciones principales

- Inicio de sesión cautivo mediante usuario institucional.
- Administración de usuarios: alta, edición, activación y desactivación.
- Catálogo de SSID con los tipos `GENERAL`, `DOCENTES` y `ALUMNOS`.
- Validación de compatibilidad entre el rol del usuario y el SSID de origen.
- Política _fail-closed_: los SSID inactivos o no registrados no otorgan acceso.
- Una sesión activa por usuario y una MAC única por sesión.
- Cambio controlado de dispositivo: `UNAUTH` de la MAC anterior y `AUTH` de la nueva.
- Cambio de SSID con la misma MAC, conservando una única sesión local.
- Sincronización manual y periódica con las autorizaciones vigentes de Omada.
- Detección y gestión de autorizaciones huérfanas: presentes en Omada sin sesión asociada en MySQL.
- Protección CSRF para operaciones modificadoras y límites de intentos de inicio de sesión.

## Tecnologías

- Node.js y Express
- EJS
- MySQL 8
- TP-Link Omada Open API
- Docker Compose para MySQL y phpMyAdmin

## Requisitos

- Node.js compatible con las dependencias del proyecto.
- Docker y Docker Compose, si se utilizará la base de datos incluida.
- Acceso a un Omada Controller con una aplicación Client Credentials configurada.
- Una red/SSID de laboratorio que redirija al portal externo.

## Instalación local

1. Clona el repositorio e instala las dependencias:

   ```bash
   npm ci
   ```

2. Crea tu archivo `.env` local con las variables requeridas. No subas ese archivo al repositorio.

   ```dotenv
   PORT=3000
   SESSION_SECRET=generar_un_valor_aleatorio_largo

   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=usuario_local
   MYSQL_PASSWORD=contraseña_local
   MYSQL_DATABASE=portal_ita

   OMADA_URL=https://controller.example
   OMADA_OMADAC_ID=identificador_del_controller
   OMADA_SITE_ID=identificador_del_sitio
   OMADA_CLIENT_ID=cliente_oauth
   OMADA_CLIENT_SECRET=secreto_oauth

   # Solo para generar un certificado de laboratorio.
   PORTAL_IP=ip_del_servidor_portal
   ```

3. Para una instalación nueva de MySQL con Docker, inicia los servicios:

   ```bash
   docker compose up -d
   ```

   El archivo `database/init.sql` se ejecuta únicamente al crear el volumen de MySQL por primera vez. phpMyAdmin queda disponible en el puerto `8080` si se inicia con Compose.

4. Inicia el portal:

   ```bash
   node server.js
   ```

   El servidor escucha en `0.0.0.0` y usa el puerto configurado en `PORT` o `3000` por defecto.

## Base de datos existente

No vuelvas a cargar `database/init.sql` sobre una base que ya contiene datos: Docker no lo aplica de nuevo sobre un volumen existente y forzar su ejecución puede afectar información previa.

Aplica únicamente la migración necesaria, desde un cliente MySQL y después de respaldar la base:

```sql
SOURCE database/migration_ssids.sql;
SOURCE database/migration_sesiones_ssid.sql;
SOURCE database/migration_autorizaciones_huerfanas.sql;
```

Las migraciones incluidas son idempotentes cuando corresponde y están destinadas a instalaciones previas del portal.

## Uso

### Portal cautivo

- Cuando Omada redirige un cliente con `clientMac`, la ruta `/` muestra el login cautivo.
- El usuario escribe únicamente la parte anterior a `@altamira.tecnm.mx`.
- El backend consulta el SSID actual en Omada, valida la compatibilidad con el rol y autoriza la MAC.
- Si se abre `/` sin una MAC de cliente, se muestra el boceto público para restablecimiento de contraseña. Aún no incluye funcionalidad de cambio de contraseña.

### Panel administrativo

Accede a `/admin` para iniciar sesión como administrador. Desde el panel es posible:

- Gestionar usuarios y SSID.
- Consultar, buscar, sincronizar y desconectar sesiones activas.
- Consultar SSID desconocidos detectados.
- Revisar autorizaciones huérfanas y desautorizarlas de forma controlada.

### Sincronización

Al iniciar el servidor se activa una sincronización automática cada cinco minutos. También puede ejecutarse manualmente desde el dashboard o la vista de sesiones.

La sincronización:

1. Consulta los registros autorizados en Omada.
2. Elimina sesiones locales que ya no existen o aparecen con `valid=false`.
3. Registra como huérfanas las MAC autorizadas en SSID administrados que no tienen sesión local.

## Reglas de acceso

| Tipo de SSID | Roles permitidos                |
| ------------ | ------------------------------- |
| `GENERAL`    | administrador, docente y alumno |
| `DOCENTES`   | administrador y docente         |
| `ALUMNOS`    | administrador y alumno          |

La sesión local almacena el último SSID desde el que el portal procesó el login. Omada autoriza por MAC dentro del sitio, por lo que un dispositivo puede mantener acceso al moverse entre SSID compatibles sin que exista una fila por cada SSID.

## Seguridad

- Mantén `.env`, certificados y capturas de Omada fuera del control de versiones.
- Configura siempre `SESSION_SECRET`; el valor de respaldo del código no es adecuado para un entorno real.
- Usa HTTPS con un certificado válido antes de producción. El comando `npm run generate-cert` genera un certificado de laboratorio a partir de `PORTAL_IP`; no sustituye un certificado confiable.
- Revisa `trust proxy` y el almacenamiento de rate limiting antes de desplegar detrás de un proxy inverso o con varias instancias.
- No copies tokens OAuth, contraseñas, cookies o respuestas completas de autenticación a issues, commits o documentación.

## Pruebas manuales realizadas

En el laboratorio se validaron los flujos principales:

- Cambio entre SSID compatibles con la misma MAC.
- Cambio de dispositivo con la misma cuenta.
- Desconexión desde administración y nuevo login.
- Rechazo de usuarios inactivos.
- Rechazo por SSID incompatible.
- Sincronización al desautorizar una MAC directamente en Omada.
- Detección y desautorización de autorizaciones huérfanas.

## Estructura del proyecto

```text
controllers/  Lógica del portal y del panel administrativo
database/     Esquema inicial y migraciones SQL
middleware/   Autorización administrativa, CSRF, rate limiting y errores
routes/       Rutas HTTP del portal y administración
services/     MySQL, Omada, sesiones, SSID y sincronización
styles/       Tokens y estilos de la interfaz
utils/        Validaciones y utilidades compartidas
views/        Vistas EJS y componentes reutilizables
```

## Licencia

ISC. Consulta `package.json` para la información actual del paquete.
