// src/middlewares/auth.js — Verifica o token JWT em rotas protegidas
const jwt = require('jsonwebtoken');

// Middleware genérico — qualquer usuário logado pode acessar
function autenticar(req, res, next) {
  const token = req.cookies?.token || req.headers?.authorization?.split(' ')[1];
  
  // Se é rota /api ou requisição AJAX, sempre retorna JSON
  const isApiRoute = req.baseUrl.startsWith('/api') || req.path.startsWith('/api');
  const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';

  if (!token) {
    if (isApiRoute || isAjax) {
      return res.status(401).json({ erro: 'Não autenticado. Faça login.' });
    }
    return res.redirect('/');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload; // { id, nome, email, funcao }
    next();
  } catch {
    if (isApiRoute || isAjax) {
      return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
    return res.redirect('/');
  }
}

// Middleware que exige uma função específica
// Uso: autorizarFuncao('FORECAST', 'ADMIN')
function autorizarFuncao(...funcoes) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
    // Suporta tanto funcao (string) quanto funcoes (array)
    const userFuncoes = req.usuario.funcoes || [req.usuario.funcao];
    const temPermissao = funcoes.some(f => userFuncoes.includes(f));
    if (!temPermissao) {
      return res.status(403).json({
        erro: `Acesso negado. Apenas ${funcoes.join(', ')} podem acessar esta rota.`
      });
    }
    next();
  };
}

module.exports = { autenticar, autorizarFuncao };
