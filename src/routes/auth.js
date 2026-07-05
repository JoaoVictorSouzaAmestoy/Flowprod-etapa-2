// src/routes/auth.js — Rotas de autenticação
const express    = require('express');
const router     = express.Router();
const { login, logout, eu } = require('../controllers/authController');
const { autenticar }        = require('../middlewares/auth');
const { verificarRateLimit } = require('../middlewares/rateLimiter');

// POST /api/login  — recebe { email, senha }
router.post('/login', verificarRateLimit, login);

// POST /api/logout — limpa o cookie
router.post('/logout', logout);

// GET  /api/me     — retorna dados do usuário logado (rota protegida)
router.get('/me', autenticar, eu);

module.exports = router;
