// src/controllers/authController.js — Login SEM criptografia (modo teste)
const jwt = require('jsonwebtoken');
const db  = require('../db');
const { notificar } = require('../notificar');
const { registrarFalha, registrarSucesso, obterIP } = require('../middlewares/rateLimiter');

// POST /api/login
async function login(req, res) {
  const { email, senha } = req.body;
  const ip = obterIP(req);

  if (!email || !senha) {
    return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const resultado = await db.query(
      'SELECT * FROM usuarios WHERE email = $1 AND senha = $2 AND ativo = TRUE',
      [email.toLowerCase().trim(), senha]
    );

    const usuario = resultado.rows[0];

    if (!usuario) {
      const tentativa = registrarFalha(ip);
      const restam    = 5 - tentativa;
      const msg       = restam > 0
        ? `E-mail ou senha incorretos. (${restam} tentativa(s) restante(s))`
        : 'Muitas tentativas. Acesso bloqueado por 15 minutos.';
      return res.status(401).json({ erro: msg });
    }

    // Login bem-sucedido — limpa o contador do IP
    registrarSucesso(ip);

    // Gera o token JWT
    const token = jwt.sign(
      {
        id:      usuario.id,
        nome:    usuario.nome,
        email:   usuario.email,
        funcoes: usuario.funcoes,   // array ex: ["FORECAST","MRP"]
        funcao:  usuario.funcoes[0], // compatibilidade — primeira função
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // Salva token em cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure:   false,
      maxAge:   8 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    // Mapa de funções → telas
    const destinos = {
      ADMIN:     '/admin.html',
      FORECAST:  '/tela2.html',
      PMP:       '/tela3.html',
      MRP:       '/tela4.html',
      ESTOQUE:   '/tela5.html',
      CRP:       '/tela6.html',
      DASHBOARD: '/dashboard.html',
    };

    // Monta lista de telas que o usuário pode acessar
    const telasDisponiveis = (usuario.funcoes || []).map(f => ({
      funcao: f,
      url:    destinos[f] || '/tela2.html',
    }));

    // ✅ Envia notificação SSE de boas-vindas ao fazer login
    const funcoesTxt = (usuario.funcoes || []).join(', ');
    await notificar(usuario.id, 'login', 
      `🎉 Bem-vindo, ${usuario.nome}!`,
      `Você fez login com sucesso. Suas funções: ${funcoesTxt || 'nenhuma'}`
    );

    return res.json({
      mensagem: 'Login realizado com sucesso!',
      usuario: {
        nome:    usuario.nome,
        email:   usuario.email,
        funcoes: usuario.funcoes,
      },
      // Se só tem uma função, redireciona direto; senão o frontend mostra o menu
      redirecionar:      telasDisponiveis.length === 1 ? telasDisponiveis[0].url : null,
      telasDisponiveis,
    });

  } catch (erro) {
    console.error('Erro no login:', erro);
    return res.status(500).json({ erro: 'Erro interno do servidor.' });
  }
}

// POST /api/logout
function logout(req, res) {
  res.clearCookie('token');
  return res.json({ mensagem: 'Logout realizado.' });
}

// GET /api/me
function eu(req, res) {
  return res.json({ usuario: req.usuario });
}

module.exports = { login, logout, eu };
