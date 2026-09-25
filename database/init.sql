CREATE DATABASE IF NOT EXISTS portal_ita CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE portal_ita;

CREATE TABLE usuarios (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'docente', 'alumno') NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_usuarios_correo (correo)
);

CREATE TABLE ssids_portal (
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

CREATE TABLE ssids_desconocidos_detectados (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre_ssid VARCHAR(100) NOT NULL,
    primera_deteccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultima_deteccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    veces_detectado INT UNSIGNED NOT NULL DEFAULT 1,
    revisado BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE KEY uq_ssid_desconocido (nombre_ssid)
);

CREATE TABLE sesiones_activas (
    usuario_id BIGINT UNSIGNED PRIMARY KEY,
    mac VARCHAR(17) NOT NULL,
    ssid VARCHAR(100) NULL,
    autorizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sesiones_mac (mac),
    CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE TABLE autorizaciones_huerfanas (
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

CREATE TABLE sessions (
    session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    expires INT(11) UNSIGNED NOT NULL,
    data MEDIUMTEXT COLLATE utf8mb4_bin,
    PRIMARY KEY (session_id)
) ENGINE = InnoDB;
