-- Migración: registro controlado de autorizaciones existentes en Omada
-- que no tienen una sesión asociada en MySQL.

USE portal_ita;

CREATE TABLE IF NOT EXISTS autorizaciones_huerfanas (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mac VARCHAR(17) NOT NULL,
    ssid VARCHAR(100) NOT NULL,
    admin_name VARCHAR(150) NULL,
    omada_start BIGINT NULL,
    primera_deteccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultima_deteccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('ACTIVA', 'RESUELTA') NOT NULL DEFAULT 'ACTIVA',
    resuelta_en DATETIME NULL,
    UNIQUE KEY uq_huerfana_mac_ssid (mac, ssid)
);
