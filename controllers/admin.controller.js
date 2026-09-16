const bcrypt = require("bcrypt");

const { buscarUsuarioPorCorreo } = require("../services/usuarios.service");
const { paginaLoginAdmin } = require("../views/admin/loginPage");
const { paginaInicioAdmin } = require("../views/admin/inicioPage");

// GET /admin -> redirige según si ya hay sesión o no.
function raizAdmin(req, res) {
    if (req.session && req.session.admin) {
        return res.redirect("/admin/inicio");
    }
    res.redirect("/admin/login");
}

// GET /admin/login
function mostrarLogin(req, res) {
    res.send(paginaLoginAdmin());
}

// POST /admin/login
async function login(req, res) {
    const { correo, password } = req.body;

    if (!correo || !password) {
        return res.send(paginaLoginAdmin({ error: "Faltan datos." }));
    }

    const usuario = await buscarUsuarioPorCorreo(correo);

    if (!usuario || usuario.rol !== "admin") {
        return res.send(paginaLoginAdmin({ error: "Credenciales inválidas." }));
    }

    if (!usuario.activo) {
        return res.send(paginaLoginAdmin({ error: "La cuenta está desactivada." }));
    }

    const passwordCorrecta = await bcrypt.compare(password, usuario.contrasena_hash);
    if (!passwordCorrecta) {
        return res.send(paginaLoginAdmin({ error: "Credenciales inválidas." }));
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
    res.send(paginaInicioAdmin(req.session.admin));
}

module.exports = {
    raizAdmin,
    mostrarLogin,
    login,
    logout,
    inicio
};