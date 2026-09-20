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
    actualizarUsuario: actualizarUsuarioEnBD,
    obtenerResumenAdmin
} = require("../services/usuarios.service");

const { unauthClient, listarAuthedRecords } = require("../services/omada");
const { sincronizarSesiones } = require("../services/sync");

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
    sincronizarSesionesManual
};