-- Migración: estado de contraseñas provisionales y cambio obligatorio.
-- Puede ejecutarse contra una instalación existente de portal_ita.
-- Los usuarios existentes conservan su contraseña y no quedan obligados
-- a cambiarla al aplicar esta migración.

USE portal_ita;

SET @requiere_cambio_columna_existe = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'requiere_cambio_contrasena'
);

SET @agregar_requiere_cambio_sql = IF(
    @requiere_cambio_columna_existe = 0,
    'ALTER TABLE usuarios ADD COLUMN requiere_cambio_contrasena BOOLEAN NOT NULL DEFAULT FALSE AFTER contrasena_hash',
    'SELECT ''La columna usuarios.requiere_cambio_contrasena ya existe'' AS resultado'
);

PREPARE agregar_requiere_cambio_stmt FROM @agregar_requiere_cambio_sql;
EXECUTE agregar_requiere_cambio_stmt;
DEALLOCATE PREPARE agregar_requiere_cambio_stmt;

SET @expiracion_columna_existe = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'contrasena_temporal_expira_en'
);

SET @agregar_expiracion_sql = IF(
    @expiracion_columna_existe = 0,
    'ALTER TABLE usuarios ADD COLUMN contrasena_temporal_expira_en DATETIME NULL AFTER requiere_cambio_contrasena',
    'SELECT ''La columna usuarios.contrasena_temporal_expira_en ya existe'' AS resultado'
);

PREPARE agregar_expiracion_stmt FROM @agregar_expiracion_sql;
EXECUTE agregar_expiracion_stmt;
DEALLOCATE PREPARE agregar_expiracion_stmt;

SET @version_columna_existe = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'version_credencial'
);

SET @agregar_version_sql = IF(
    @version_columna_existe = 0,
    'ALTER TABLE usuarios ADD COLUMN version_credencial INT UNSIGNED NOT NULL DEFAULT 0 AFTER contrasena_temporal_expira_en',
    'SELECT ''La columna usuarios.version_credencial ya existe'' AS resultado'
);

PREPARE agregar_version_stmt FROM @agregar_version_sql;
EXECUTE agregar_version_stmt;
DEALLOCATE PREPARE agregar_version_stmt;

SET @actualizacion_columna_existe = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'contrasena_actualizada_en'
);

SET @agregar_actualizacion_sql = IF(
    @actualizacion_columna_existe = 0,
    'ALTER TABLE usuarios ADD COLUMN contrasena_actualizada_en DATETIME NULL AFTER version_credencial',
    'SELECT ''La columna usuarios.contrasena_actualizada_en ya existe'' AS resultado'
);

PREPARE agregar_actualizacion_stmt FROM @agregar_actualizacion_sql;
EXECUTE agregar_actualizacion_stmt;
DEALLOCATE PREPARE agregar_actualizacion_stmt;
