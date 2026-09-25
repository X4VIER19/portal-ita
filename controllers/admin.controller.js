const bcrypt = require("bcrypt");

const {
    buscarUsuarioPorCorreo,
    listarUsuariosPaginados,
    contarUsuarios,
    buscarUsuarioPorId,
    crearUsuario: crearUsuarioEnBD,
    cambiarEstadoUsuario,
    listarSesionesPaginadas,
    contarSesiones,
    eliminarSesionActiva,
    buscarSesionActivaPorMac,
    actualizarUsuario: actualizarUsuarioEnBD,
    obtenerResumenAdmin
} = require("../services/usuarios.service");

const { unauthClient, unauthEfectivo, listarAuthedRecords } = require("../services/omada");
const { sincronizarSesiones } = require("../services/sync");
const {
    listarAutorizacionesHuerfanas,
    contarAutorizacionesHuerfanasPendientes,
    eliminarRegistrosAutorizacionesHuerfanas,
    buscarAutorizacionHuerfanaPorId,
    marcarAutorizacionHuerfanaResuelta
} = require("../services/autorizacionesHuerfanas.service");

const {
    TIPOS_VALIDOS: TIPOS_SSID_VALIDOS,
    listarSsids,
    buscarSsidPorId,
    crearSsid: crearSsidEnBD,
    actualizarSsid: actualizarSsidEnBD,
    eliminarSsid: eliminarSsidEnBD,
    listarSsidsDesconocidos,
    contarSsidsDesconocidosPendientes,
    marcarSsidDesconocidoRevisado,
    eliminarSsidDesconocido: eliminarSsidDesconocidoEnBD
} = require("../services/ssids.service");

const ROLES_VALIDOS = ["admin", "docente", "alumno"];
function esPeticionAjax(req) {
    return (
        req.headers.accept?.includes("application/json") ||
        req.headers["x-requested-with"] === "XMLHttpRequest"
    );
}

function rechazarFormulario(req, res, { status, mensaje, vista, valores }) {
    if (esPeticionAjax(req)) {
        return res.status(status).json({ ok: false, mensaje });
    }

    return res.status(status).render(vista, {
        error: mensaje,
        valores,
        ...req.session.admin
    });
}

// GET /admin -> redirige según si ya hay sesión o no.
function raizAdmin(req, res) {
    if (req.session && req.session.admin) {
        return res.redirect("/admin/inicio");
    }

    res.redirect("/admin/login");
}

// GET /admin/login
function mostrarLogin(req, res) {
    res.render("admin/login", { error: null });
}

// POST /admin/login
async function login(req, res) {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.render("admin/login", {
            error: "Faltan datos."
        });
    }

    const usuario = await buscarUsuarioPorCorreo(correo);

    if (!usuario || usuario.rol !== "admin") {
        return res.render("admin/login", {
            error: "Credenciales inválidas."
        });
    }

    if (!usuario.activo) {
        return res.render("admin/login", {
            error: "La cuenta está desactivada."
        });
    }

    const passwordCorrecta = await bcrypt.compare(
        password,
        usuario.contrasena_hash
    );

    if (!passwordCorrecta) {
        return res.render("admin/login", {
            error: "Credenciales inválidas."
        });
    }

    req.session.admin = {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        rol: usuario.rol
    };

    res.redirect("/admin/inicio");
}

// GET /admin/logout
function logout(req, res) {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
}

// GET /admin/inicio
async function inicio(req, res) {
    const resumen = await obtenerResumenAdmin();

    const sync = ["ok", "error"].includes(req.query.sync)
        ? req.query.sync
        : null;

    const eliminadas = Number.parseInt(
        req.query.eliminadas,
        10
    ) || 0;

    const actualizadoEn = typeof req.query.actualizado === "string"
        ? req.query.actualizado
        : null;

    res.render("admin/inicio", {
        ...req.session.admin,
        resumen,
        sync,
        eliminadas,
        actualizadoEn
    });
}

// POST /admin/inicio/sincronizar
async function sincronizarSesionesInicio(req, res) {
    const resultado = await sincronizarSesiones();

    const params = new URLSearchParams();

    params.set(
        "sync",
        resultado.error ? "error" : "ok"
    );

    params.set(
        "eliminadas",
        resultado.eliminadas
    );

    if (!resultado.error) {
        params.set(
            "actualizado",
            new Date().toISOString()
        );
    }

    res.redirect(`/admin/inicio?${params.toString()}`);
}

// GET /admin/usuarios
async function mostrarUsuarios(req, res) {
    const limite = 10;

    const paginaSolicitada = Number.parseInt(
        req.query.page,
        10
    );

    const paginaActual =
        Number.isInteger(paginaSolicitada) &&
            paginaSolicitada > 0
            ? paginaSolicitada
            : 1;

    const busqueda =
        typeof req.query.busqueda === "string"
            ? req.query.busqueda.trim()
            : "";

    const filtroRol =
        ROLES_VALIDOS.includes(req.query.rol)
            ? req.query.rol
            : "";

    const estado =
        ["activo", "inactivo"].includes(req.query.estado)
            ? req.query.estado
            : "";

    const filtros = {
        busqueda,
        rol: filtroRol,
        estado
    };

    const total = await contarUsuarios(filtros);

    const totalPaginas = Math.max(
        1,
        Math.ceil(total / limite)
    );

    const paginaValida = Math.min(
        paginaActual,
        totalPaginas
    );

    const offset =
        (paginaValida - 1) * limite;

    const usuarios = await listarUsuariosPaginados({
        ...filtros,
        limite,
        offset
    });

    const inicio =
        total === 0
            ? 0
            : offset + 1;

    const fin = Math.min(
        offset + usuarios.length,
        total
    );

    res.render("admin/usuarios", {
        usuarios,
        busqueda,
        filtroRol,
        estado,
        paginaActual: paginaValida,
        totalPaginas,
        total,
        inicio,
        fin,
        ...req.session.admin
    });
}

// GET /admin/usuarios/nuevo
function mostrarFormularioNuevo(req, res) {
    res.render("admin/usuarios-nuevo", {
        error: null,
        valores: {},
        ...req.session.admin
    });
}

// POST /admin/usuarios/nuevo (protegida)
// Responde JSON si viene del modal (AJAX) y HTML/redirect si viene del formulario normal.
async function crearUsuario(req, res) {
    const { nombre, apellido, correo, contrasena, rol } = req.body;

    const rechazar = (status, mensaje) =>
        rechazarFormulario(req, res, {
            status,
            mensaje,
            vista: "admin/usuarios-nuevo",
            valores: req.body
        });

    if (!nombre || !apellido || !correo || !contrasena || !rol) {
        return rechazar(400, "Todos los campos son obligatorios.");
    }

    if (!ROLES_VALIDOS.includes(rol)) {
        return rechazar(400, "El rol seleccionado no es válido.");
    }

    try {
        await crearUsuarioEnBD({
            nombre,
            apellido,
            correo,
            contrasena_hash: await bcrypt.hash(contrasena, 10),
            rol
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return rechazar(409, "Ya existe un usuario con ese correo.");
        }

        throw err;
    }

    if (esPeticionAjax(req)) {
        return res.status(201).json({
            ok: true,
            mensaje: "Usuario creado correctamente."
        });
    }

    res.redirect("/admin/usuarios");
}

// POST /admin/usuarios/:id/toggle
async function toggleActivo(req, res) {
    const { id } = req.params;

    const usuario = await buscarUsuarioPorId(id);

    if (usuario) {
        await cambiarEstadoUsuario(
            id,
            !usuario.activo
        );
    }

    res.redirect("/admin/usuarios");
}

// GET /admin/usuarios/editar/:id
async function mostrarFormularioEditar(req, res) {
    const { id } = req.params;

    const usuario = await buscarUsuarioPorId(id);

    if (!usuario) {
        return res.redirect("/admin/usuarios");
    }

    res.render("admin/usuarios-editar", {
        error: null,
        valores: usuario,
        ...req.session.admin
    });
}

// POST /admin/usuarios/editar/:id
// Responde JSON si viene del modal (AJAX) y HTML/redirect si viene del formulario normal.
async function actualizarUsuario(req, res) {
    const { id } = req.params;
    const { nombre, apellido, correo, rol, contrasena } = req.body;

    const rechazar = (status, mensaje) =>
        rechazarFormulario(req, res, {
            status,
            mensaje,
            vista: "admin/usuarios-editar",
            valores: { id, nombre, apellido, correo, rol }
        });

    if (!nombre || !apellido || !correo || !rol) {
        return rechazar(400, "Nombre, apellido, correo y rol son obligatorios.");
    }

    if (!ROLES_VALIDOS.includes(rol)) {
        return rechazar(400, "El rol seleccionado no es válido.");
    }

    try {
        await actualizarUsuarioEnBD(id, {
            nombre,
            apellido,
            correo,
            rol,
            contrasena_hash: contrasena
                ? await bcrypt.hash(contrasena, 10)
                : null
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return rechazar(409, "Ya existe otro usuario con ese correo.");
        }

        throw err;
    }

    if (esPeticionAjax(req)) {
        return res.json({
            ok: true,
            mensaje: "Usuario actualizado correctamente."
        });
    }

    res.redirect("/admin/usuarios");
}

// GET /admin/sesiones
async function mostrarSesiones(req, res) {
    const limite = 10;

    const paginaSolicitada =
        Number.parseInt(req.query.page, 10);

    const paginaActual =
        Number.isInteger(paginaSolicitada) &&
            paginaSolicitada > 0
            ? paginaSolicitada
            : 1;

    const busqueda =
        typeof req.query.busqueda === "string"
            ? req.query.busqueda.trim()
            : "";

    const filtroRol =
        ROLES_VALIDOS.includes(req.query.rol)
            ? req.query.rol
            : "";

    const filtros = {
        busqueda,
        rol: filtroRol
    };

    const total = await contarSesiones(filtros);

    const totalPaginas = Math.max(
        1,
        Math.ceil(total / limite)
    );

    const paginaValida = Math.min(
        paginaActual,
        totalPaginas
    );

    const offset =
        (paginaValida - 1) * limite;

    const sesiones = await listarSesionesPaginadas({
        ...filtros,
        limite,
        offset
    });

    let registrosOmada = null;
    let omadaError = false;

    try {
        registrosOmada = await listarAuthedRecords();
    } catch (err) {
        console.error(
            "No se pudo consultar authed-records de Omada:",
            err.message
        );

        omadaError = true;
    }

    let estadoPorMac = null;

    if (registrosOmada) {
        estadoPorMac = new Map();

        for (const registro of registrosOmada) {
            const mac =
                (registro.mac || "").toUpperCase();

            if (!mac) {
                continue;
            }

            const actual = estadoPorMac.get(mac);

            if (
                !actual ||
                (registro.start || 0) >
                (actual.start || 0)
            ) {
                estadoPorMac.set(mac, registro);
            }
        }
    }

    const sesionesConEstado =
        sesiones.map(sesion => {
            let estadoOmada = "desconocido";

            if (estadoPorMac) {
                const registro =
                    estadoPorMac.get(
                        (sesion.mac || "").toUpperCase()
                    );

                estadoOmada = registro
                    ? (
                        registro.valid
                            ? "activo"
                            : "expirado"
                    )
                    : "sin_registro";
            }

            return {
                ...sesion,
                estadoOmada
            };
        });

    const inicio =
        total === 0
            ? 0
            : offset + 1;

    const fin = Math.min(
        offset + sesionesConEstado.length,
        total
    );

    const sync =
        ["ok", "error"].includes(req.query.sync)
            ? req.query.sync
            : null;

    const eliminadas =
        Number.parseInt(
            req.query.eliminadas,
            10
        ) || 0;

    res.render("admin/sesiones", {
        sesiones: sesionesConEstado,
        busqueda,
        filtroRol,
        paginaActual: paginaValida,
        totalPaginas,
        total,
        inicio,
        fin,
        omadaError,
        sync,
        eliminadas,
        ...req.session.admin
    });
}

// POST /admin/sesiones/:usuarioId/desconectar
async function desconectarSesion(req, res) {
    const { usuarioId } = req.params;
    const { mac } = req.body;

    if (mac) {
        await unauthClient(mac);
    }

    await eliminarSesionActiva(usuarioId);

    res.redirect("/admin/sesiones");
}

// POST /admin/sesiones/sincronizar
async function sincronizarSesionesManual(req, res) {
    const resultado = await sincronizarSesiones();

    const params = new URLSearchParams();

    if (req.body.busqueda) {
        params.set(
            "busqueda",
            req.body.busqueda
        );
    }

    if (req.body.rol) {
        params.set(
            "rol",
            req.body.rol
        );
    }

    params.set(
        "sync",
        resultado.error
            ? "error"
            : "ok"
    );

    params.set(
        "eliminadas",
        resultado.eliminadas
    );

    res.redirect(
        `/admin/sesiones?${params.toString()}`
    );
}

// ------------------------------------------------------------------
// NUEVO: administración de SSIDs (/admin/ssids)
// ------------------------------------------------------------------

// GET /admin/ssids
async function mostrarSsids(req, res) {
    const ssids = await listarSsids();
    const conteoDesconocidos = await contarSsidsDesconocidosPendientes();

    res.render("admin/ssids", {
        ssids,
        conteoDesconocidos,
        ...req.session.admin
    });
}

// GET /admin/ssids/nuevo
function mostrarFormularioNuevoSsid(req, res) {
    res.render("admin/ssids-nuevo", {
        error: null,
        valores: {},
        ...req.session.admin
    });
}

// POST /admin/ssids/nuevo
async function crearSsid(req, res) {
    const { nombre_ssid, tipo } = req.body;

    if (!nombre_ssid || !tipo) {
        return res.status(400).render("admin/ssids-nuevo", {
            error: "El nombre del SSID y el tipo son obligatorios.",
            valores: req.body,
            ...req.session.admin
        });
    }

    if (!TIPOS_SSID_VALIDOS.includes(tipo)) {
        return res.status(400).render("admin/ssids-nuevo", {
            error: "El tipo seleccionado no es válido.",
            valores: req.body,
            ...req.session.admin
        });
    }

    try {
        await crearSsidEnBD({
            nombre_ssid: nombre_ssid.trim(),
            tipo
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).render("admin/ssids-nuevo", {
                error: "Ya existe un SSID registrado con ese nombre.",
                valores: req.body,
                ...req.session.admin
            });
        }

        throw err;
    }

    res.redirect("/admin/ssids");
}

// GET /admin/ssids/editar/:id
async function mostrarFormularioEditarSsid(req, res) {
    const { id } = req.params;

    const ssid = await buscarSsidPorId(id);

    if (!ssid) {
        return res.redirect("/admin/ssids");
    }

    res.render("admin/ssids-editar", {
        error: null,
        valores: ssid,
        ...req.session.admin
    });
}

// POST /admin/ssids/editar/:id
async function actualizarSsid(req, res) {
    const { id } = req.params;
    const { nombre_ssid, tipo, activo } = req.body;

    const activoBooleano = activo === "on" || activo === "1" || activo === true;

    if (!nombre_ssid || !tipo) {
        return res.status(400).render("admin/ssids-editar", {
            error: "El nombre del SSID y el tipo son obligatorios.",
            valores: { id, nombre_ssid, tipo, activo: activoBooleano },
            ...req.session.admin
        });
    }

    if (!TIPOS_SSID_VALIDOS.includes(tipo)) {
        return res.status(400).render("admin/ssids-editar", {
            error: "El tipo seleccionado no es válido.",
            valores: { id, nombre_ssid, tipo, activo: activoBooleano },
            ...req.session.admin
        });
    }

    try {
        await actualizarSsidEnBD(id, {
            nombre_ssid: nombre_ssid.trim(),
            tipo,
            activo: activoBooleano
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).render("admin/ssids-editar", {
                error: "Ya existe otro SSID registrado con ese nombre.",
                valores: { id, nombre_ssid, tipo, activo: activoBooleano },
                ...req.session.admin
            });
        }

        throw err;
    }

    res.redirect("/admin/ssids");
}

// POST /admin/ssids/:id/eliminar
async function eliminarSsid(req, res) {
    const { id } = req.params;

    await eliminarSsidEnBD(id);

    res.redirect("/admin/ssids");
}

// ------------------------------------------------------------------
// NUEVO: SSIDs desconocidos detectados (/admin/ssids/desconocidos)
// Solo diagnóstico: no autoriza ni desautoriza nada en Omada.
// ------------------------------------------------------------------

// GET /admin/ssids/desconocidos
async function mostrarSsidsDesconocidos(req, res) {
    const ssidsDesconocidos = await listarSsidsDesconocidos();

    res.render("admin/ssids-desconocidos", {
        ssidsDesconocidos,
        ...req.session.admin
    });
}

// POST /admin/ssids/desconocidos/:id/revisado
async function marcarSsidDesconocidoRevisadoController(req, res) {
    const { id } = req.params;
    const { revisado } = req.body;

    await marcarSsidDesconocidoRevisado(
        id,
        revisado === "true" || revisado === "1" || revisado === true
    );

    res.redirect("/admin/ssids/desconocidos");
}

// POST /admin/ssids/desconocidos/:id/eliminar
async function eliminarSsidDesconocidoController(req, res) {
    const { id } = req.params;

    await eliminarSsidDesconocidoEnBD(id);

    res.redirect("/admin/ssids/desconocidos");
}

// GET /admin/autorizaciones-huerfanas
async function mostrarAutorizacionesHuerfanas(req, res) {
    const [autorizaciones, pendientes] = await Promise.all([
        listarAutorizacionesHuerfanas(),
        contarAutorizacionesHuerfanasPendientes()
    ]);
    const resultado = ["desautorizada", "asociada", "limpiados", "error"].includes(req.query.resultado)
        ? req.query.resultado
        : null;
    const cantidadEliminada = Number.parseInt(req.query.cantidad, 10) || 0;

    res.render("admin/autorizaciones-huerfanas", {
        autorizaciones,
        pendientes,
        resultado,
        cantidadEliminada,
        ...req.session.admin
    });
}

// POST /admin/autorizaciones-huerfanas/limpiar
async function limpiarRegistrosAutorizacionesHuerfanas(req, res) {
    const cantidad = await eliminarRegistrosAutorizacionesHuerfanas();

    res.redirect(
        `/admin/autorizaciones-huerfanas?resultado=limpiados&cantidad=${cantidad}`
    );
}

// POST /admin/autorizaciones-huerfanas/:id/desautorizar
async function desautorizarAutorizacionHuerfana(req, res) {
    const autorizacion = await buscarAutorizacionHuerfanaPorId(req.params.id);

    if (!autorizacion || autorizacion.estado !== "ACTIVA") {
        return res.redirect("/admin/autorizaciones-huerfanas?resultado=error");
    }

    // Evita desautorizar una MAC que haya obtenido una sesión válida desde
    // la última sincronización y antes de la acción del administrador.
    const sesionActual = await buscarSesionActivaPorMac(autorizacion.mac);

    if (sesionActual) {
        await marcarAutorizacionHuerfanaResuelta(autorizacion.id);
        return res.redirect("/admin/autorizaciones-huerfanas?resultado=asociada");
    }

    let resultadoUnauth;

    try {
        resultadoUnauth = await unauthClient(autorizacion.mac);
    } catch (error) {
        console.error(
            `No se pudo desautorizar la MAC huérfana ${autorizacion.mac}:`,
            error.message
        );
        return res.redirect("/admin/autorizaciones-huerfanas?resultado=error");
    }

    if (!unauthEfectivo(resultadoUnauth)) {
        return res.redirect("/admin/autorizaciones-huerfanas?resultado=error");
    }

    await marcarAutorizacionHuerfanaResuelta(autorizacion.id);
    res.redirect("/admin/autorizaciones-huerfanas?resultado=desautorizada");
}

module.exports = {
    raizAdmin,
    mostrarLogin,
    login,
    logout,
    inicio,
    sincronizarSesionesInicio,
    mostrarUsuarios,
    mostrarFormularioNuevo,
    crearUsuario,
    toggleActivo,
    mostrarFormularioEditar,
    actualizarUsuario,
    mostrarSesiones,
    desconectarSesion,
    sincronizarSesionesManual,
    mostrarSsids,
    mostrarFormularioNuevoSsid,
    crearSsid,
    mostrarFormularioEditarSsid,
    actualizarSsid,
    eliminarSsid,
    mostrarSsidsDesconocidos,
    marcarSsidDesconocidoRevisadoController,
    eliminarSsidDesconocidoController,
    mostrarAutorizacionesHuerfanas,
    limpiarRegistrosAutorizacionesHuerfanas,
    desautorizarAutorizacionHuerfana
};
