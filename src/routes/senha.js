// src/routes/senha.js — Rotas de redefinição de senha
const express = require('express');
const router  = express.Router();
const { autenticar, autorizarFuncao } = require('../middlewares/auth');
const { solicitar, listarSolicitacoes, aprovar, recusar, contarPendentes, naoFuiEu } = require('../controllers/senhaController');

// ── Rota PÚBLICA — executor solicita redefinição ───────────
// POST /api/senha/solicitar  { email }
router.post('/solicitar', solicitar);

// GET /api/senha/status-por-nome?nome=... — verificar status de alteração (para primeiro acesso)
router.get('/status-por-nome', async (req, res) => {
  try {
    const { nome } = req.query;
    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
    
    const db = require('../db');
    
    // Busca a solicitação mais recente deste executor
    const resultado = await db.query(
      `SELECT s.id, s.status, u.nome, u.email, u.senha
       FROM solicitacoes_senha s
       JOIN usuarios u ON s.usuario_id = u.id
       WHERE LOWER(u.nome) = LOWER($1)
       ORDER BY s.criado_em DESC
       LIMIT 1`,
      [nome.trim()]
    );
    
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Nenhuma solicitação encontrada para este nome.' });
    }
    
    const sol = resultado.rows[0];
    
    // Retorna status
    if (sol.status === 'PENDENTE') {
      return res.json({
        status: 'PENDENTE',
        mensagem: '⏳ Sua solicitação está em análise pelo administrador. Aguarde...',
        criado_em: sol.criado_em
      });
    } else if (sol.status === 'APROVADA') {
      return res.json({
        status: 'APROVADA',
        mensagem: '✅ Sua senha foi redefinida!',
        nome: sol.nome,
        email: sol.email,
        senha: sol.senha
      });
    } else {
      return res.json({
        status: 'RECUSADA',
        mensagem: '❌ Sua solicitação foi recusada. Contate o administrador.'
      });
    }
  } catch(err) {
    console.error('Erro ao verificar status:', err);
    res.status(500).json({ erro: 'Erro ao verificar status.' });
  }
});

// ── Rota PÚBLICA — executor solicita redefinição ───────────

// ── Rotas PROTEGIDAS — apenas ADMIN ───────────────────────
router.use(autenticar);
router.use(autorizarFuncao('ADMIN'));

// GET  /api/senha/solicitacoes          — lista todas
router.get('/solicitacoes', listarSolicitacoes);

// GET  /api/senha/pendentes/contagem    — badge de contagem
router.get('/pendentes/contagem', contarPendentes);

// POST /api/senha/aprovar/:id  { nova_senha }
router.post('/aprovar/:id', aprovar);

// POST /api/senha/recusar/:id
router.post('/recusar/:id', recusar);

// POST /api/senha/nao-fui-eu — executor reporta alteração não autorizada
router.post('/nao-fui-eu', autenticar, naoFuiEu);

module.exports = router;
