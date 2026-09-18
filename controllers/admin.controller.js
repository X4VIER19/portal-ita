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
    actualizarUsuario: actualizarUsuarioEnBD
} = require("../services/usuarios.service");
const { unauthClient, listarAuthedRecords } = require("../services/omada");
const { sincronizarSesiones } = require("../services/sync");

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
        return res.render("admin/login", { error: "Faltan datos." });
    }

    const usuario = await buscarUsuarioPorCorreo(correo);

    if (!usuario || usuario.rol !== "admin") {
        return res.render("admin/login", { error: "Credenciales inválidas." });
    }

    if (!usuario.activo) {
        return res.render("admin/login", { error: "La cuenta está desactivada." });
    }

    const passwordCorrecta = await bcrypt.compare(password, usuario.contrasena_hash);
    if (!passwordCorrecta) {
        return res.render("admin/login", { error: "Credenciales inválidas." });
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

// GET /admin/inicio (protegida por middleware requiereAdmin)
function inicio(req, res) {
    res.render("admin/inicio", req.session.admin);
}

// GET /admin/usuarios (protegida)
async function mostrarUsuarios(req, res) {
    const limite = 10;
    const paginaSolicitada = Number.parseInt(req.query.page, 10);
    const paginaActual = Number.isInteger(paginaSolicitada) && paginaSolicitada > 0
        ? paginaSolicitada
        : 1;

    const busqueda = typeof req.query.busqueda === "string" ? req.query.busqueda.trim() : "";
    const filtroRol = ["admin", "docente", "alumno"].includes(req.query.rol) ? req.query.rol : "";
    const estado = ["activo", "inactivo"].includes(req.query.estado) ? req.query.estado : "";

    const filtros = { busqueda, rol: filtroRol, estado };
    const total = await contarUsuarios(filtros);
    const totalPaginas = Math.max(1, Math.ceil(total / limite));
    const paginaValida = Math.min(paginaActual, totalPaginas);
    const offset = (paginaValida - 1) * limite;

    const usuarios = await listarUsuariosPaginados({
        ...filtros,
        limite,
        offset
    });

    const inicio = total === 0 ? 0 : offset + 1;
    const fin = Math.min(offset + usuarios.length, total);

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

// GET /admin/usuarios/nuevo (protegida)
function mostrarFormularioNuevo(req, res) {
    res.render("admin/usuarios-nuevo", {
        error: null,
        valores: {},
        ...req.session.admin
    });
}

// POST /admin/usuarios/nuevo (protegida)
async function crearUsuario(req, res) {
    const { nombre, apellido, correo, contrasena, rol } = req.body;

    if (!nombre || !apellido || !correo || !contrasena || !rol) {
        return res.render("admin/usuarios-nuevo", {
            error: "Todos los campos son obligatorios.",
            valores: req.body,
            ...req.session.admin
        });
    }

    const contrasenaHash = await bcrypt.hash(contrasena, 10);

    try {
        await crearUsuarioEnBD({
            nombre,
            apellido,
            correo,
            contrasena_hash: contrasenaHash,
            rol
        });
    } catch (err) {
        // Correo duplicado -> error de formulario, no error 500 genérico
        if (err.code === "ER_DUP_ENTRY") {
            return res.render("admin/usuarios-nuevo", {
                error: "Ya existe un usuario con ese correo.",
                valores: req.body,
                ...req.session.admin
            });
        }
        throw err; // cualquier otro error lo atrapa errorHandler.js
    }

    res.redirect("/admin/usuarios");
}

// POST /admin/usuarios/:id/toggle (protegida)
async function toggleActivo(req, res) {
    const { id } = req.params;
    const usuario = await buscarUsuarioPorId(id);

    if (usuario) {
        await cambiarEstadoUsuario(id, !usuario.activo);
    }

    res.redirect("/admin/usuarios");
}

// GET /admin/usuarios/editar/:id (protegida)
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

// POST /admin/usuarios/editar/:id (protegida)
async function actualizarUsuario(req, res) {
    const { id } = req.params;
    const { nombre, apellido, correo, rol, contrasena } = req.body;

    if (!nombre || !apellido || !correo || !rol) {
        return res.render("admin/usuarios-editar", {
            error: "Nombre, apellido, correo y rol son obligatorios.",
            valores: { id, nombre, apellido, correo, rol },
            ...req.session.admin
        });
    }

    // La contraseña es opcional al editar: en blanco = se conserva la actual.
    const contrasenaHash = contrasena ? await bcrypt.hash(contrasena, 10) : null;

    try {
        await actualizarUsuarioEnBD(id, {
            nombre,
            apellido,
            correo,
            rol,
            contrasena_hash: contrasenaHash
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.render("admin/usuarios-editar", {
                error: "Ya existe otro usuario con ese correo.",
                valores: { id, nombre, apellido, correo, rol },
                ...req.session.admin
            });
        }
        throw err;
    }

    res.redirect("/admin/usuarios");
}

// GET /admin/sesiones (protegida)
async function mostrarSesiones(req, res) {
    const limite = 10;
    const paginaSolicitada = Number.parseInt(req.query.page, 10);
    const paginaActual = Number.isInteger(paginaSolicitada) && paginaSolicitada > 0
        ? paginaSolicitada
        : 1;

    const busqueda = typeof req.query.busqueda === "string" ? req.query.busqueda.trim() : "";
    const filtroRol = ["admin", "docente", "alumno"].includes(req.query.rol) ? req.query.rol : "";

    const filtros = { busqueda, rol: filtroRol };
    const total = await contarSesiones(filtros);
    const totalPaginas = Math.max(1, Math.ceil(total / limite));
    const paginaValida = Math.min(paginaActual, totalPaginas);
    const offset = (paginaValida - 1) * limite;

    const sesiones = await listarSesionesPaginadas({
        ...filtros,
        limite,
        offset
    });

    // Intentamos cruzar con el estado real de Omada. Si Omada no
    // responde (Controller apagado, red caída, etc.)
    // mostramos lo que tenemos en la BD.
    let registrosOmada = null;
    let omadaError = false;

    try {
        registrosOmada = await listarAuthedRecords();
    } catch (err) {
        console.error("No se pudo consultar authed-records de Omada:", err.message);
        omadaError = true;
    }

    // Igual que en services/sync.js: nos quedamos con el registro MÁS
    // RECIENTE de cada MAC (por `start`), porque Omada nunca actualiza un
    // registro existente, siempre crea uno nuevo por cada auth/unauth.
    let estadoPorMac = null;
    if (registrosOmada) {
        estadoPorMac = new Map();
        for (const registro of registrosOmada) {
            const mac = (registro.mac || "").toUpperCase();
            if (!mac) continue;
            const actual = estadoPorMac.get(mac);
            if (!actual || (registro.start || 0) > (actual.start || 0)) {
                estadoPorMac.set(mac, registro);
            }
        }
    }

    const sesionesConEstado = sesiones.map(s => {
        let estadoOmada = "desconocido";

        if (estadoPorMac) {
            const registro = estadoPorMac.get((s.mac || "").toUpperCase());
            estadoOmada = registro ? (registro.valid ? "activo" : "expirado") : "sin_registro";
        }

        return { ...s, estadoOmada };
    });

    const inicio = total === 0 ? 0 : offset + 1;
    const fin = Math.min(offset + sesionesConEstado.length, total);

    // Feedback de la sincronización manual (si el usuario acaba de
    // presionar el botón "Sincronizar con Omada").
    const sync = ["ok", "error"].includes(req.query.sync) ? req.query.sync : null;
    const eliminadas = Number.parseInt(req.query.eliminadas, 10) || 0;

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

// POST /admin/sesiones/:usuarioId/desconectar (protegida)
async function desconectarSesion(req, res) {
    const { usuarioId } = req.params;
    const { mac } = req.body;

    if (mac) {
        await unauthClient(mac);
    }

    await eliminarSesionActiva(usuarioId);

    res.redirect("/admin/sesiones");
}

// POST /admin/sesiones/sincronizar (protegida)
// Dispara manualmente la misma lógica que corre automáticamente cada
// N minutos (services/sync.js), y regresa a /admin/sesiones conservando
// los filtros activos, con un resumen de cuántas sesiones se limpiaron.
async function sincronizarSesionesManual(req, res) {
    const resultado = await sincronizarSesiones();

    const params = new URLSearchParams();
    if (req.body.busqueda) params.set("busqueda", req.body.busqueda);
    if (req.body.rol) params.set("rol", req.body.rol);
    params.set("sync", resultado.error ? "error" : "ok");
    params.set("eliminadas", resultado.eliminadas);

    res.redirect(`/admin/sesiones?${params.toString()}`);
}

module.exports = {
    raizAdmin,
    mostrarLogin,
    login,
    logout,
    inicio,
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
