-- Migración: registrar el SSID asociado a cada sesión activa.
-- Puede ejecutarse contra una instalación existente de portal_ita.
-- Las sesiones existentes quedan con SSID desconocido (NULL) hasta su
-- siguiente autenticación correcta.

USE portal_ita;

SET @ssid_columna_existe = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'sesiones_activas'
      AND COLUMN_NAME = 'ssid'
);

SET @agregar_ssid_sql = IF(
    @ssid_columna_existe = 0,
    'ALTER TABLE sesiones_activas ADD COLUMN ssid VARCHAR(100) NULL AFTER mac',
    'SELECT ''La columna sesiones_activas.ssid ya existe'' AS resultado'
);

PREPARE agregar_ssid_stmt FROM @agregar_ssid_sql;
EXECUTE agregar_ssid_stmt;
DEALLOCATE PREPARE agregar_ssid_stmt;
