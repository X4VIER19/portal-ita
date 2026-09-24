-- Migración: soporte de validación de SSID por tipo de usuario.
-- Ejecutar contra la base de datos existente (portal_ita).
--
-- Estas mismas dos tablas también deben agregarse a database/init.sql
-- para que las instalaciones nuevas las incluyan desde el principio.

USE portal_ita;

-- Configuración de SSIDs administrados por el portal.
-- Se administra manualmente desde /admin/ssids.
CREATE TABLE IF NOT EXISTS ssids_portal (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre_ssid VARCHAR(100) NOT NULL,
    tipo ENUM(
        'GENERAL',
        'DOCENTES',
        'ALUMNOS'
    ) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ssid_nombre (nombre_ssid)
);

-- Registro de diagnóstico: SSIDs vistos en intentos de login que NO
-- están registrados en ssids_portal. No bloquea ni modifica nada más;
-- solo sirve para que el administrador decida si debe darlos de alta.
-- El login correspondiente ya fue rechazado (fail-closed) antes de
-- llegar aquí; esta tabla es puramente informativa.
CREATE TABLE IF NOT EXISTS ssids_desconocidos_detectados (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre_ssid VARCHAR(100) NOT NULL,
    primera_deteccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultima_deteccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    veces_detectado INT UNSIGNED NOT NULL DEFAULT 1,
    revisado BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE KEY uq_ssid_desconocido (nombre_ssid)
);