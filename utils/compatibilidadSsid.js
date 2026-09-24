/**
 * Única fuente de verdad para decidir si un usuario puede autenticarse
 * desde un SSID de un tipo determinado.
 *
 * Reglas de negocio (confirmadas en el diseño):
 *   GENERAL   -> admin, docente, alumno
 *   DOCENTES  -> admin, docente
 *   ALUMNOS   -> admin, alumno
 *
 * No repartir esta lógica en controladores. Cualquier cambio a las
 * reglas de compatibilidad debe hacerse únicamente aquí.
 */

const COMPATIBILIDAD = {
    GENERAL: new Set(["admin", "docente", "alumno"]),
    DOCENTES: new Set(["admin", "docente"]),
    ALUMNOS: new Set(["admin", "alumno"])
};

/**
 * @param {string} tipoSsid - 'GENERAL' | 'DOCENTES' | 'ALUMNOS'
 * @param {string} rolUsuario - 'admin' | 'docente' | 'alumno'
 * @returns {boolean}
 */
function esCompatible(tipoSsid, rolUsuario) {
    const permitidos = COMPATIBILIDAD[tipoSsid];

    if (!permitidos) {
        // Tipo de SSID no reconocido. Fail-closed.
        return false;
    }

    return permitidos.has(rolUsuario);
}

module.exports = {
    esCompatible,
    COMPATIBILIDAD
};
