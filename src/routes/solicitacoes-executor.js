// src/routes/solicitacoes-executor.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { autenticar, autorizarFuncao } = require('../middlewares/auth');
const { notificarAdmins, notificar, logAdmin } = require('../notificar');
const {
  emailAdminNovaSolicitacaoExecutor,
  emailExecutorAprovado,
  emailExecutorRecusado,
  enviarEmail,
} = require('../email');

// ── POST /api/solicitacoes-executor ──────────────────────────
// Público — colaborador envia solicitação de acesso
router.post('/', async (req, res) => {
  let { nome, email, senha, funcoes } = req.body;

  if (!nome || !nome.trim())
    return res.status(400).json({ erro: 'Nome completo é obrigatório.' });
  if (!email || !email.trim())
    return res.status(400).json({ erro: 'E-mail é obrigatório.' });
  if (!senha || senha.length < 6)
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres.' });

  // Aceita funcoes como string separada por vírgula OU array
  if (typeof funcoes === 'string') {
    funcoes = funcoes.split(',').map(f => f.trim()).filter(Boolean);
  }
  if (!funcoes || !Array.isArray(funcoes) || funcoes.length === 0)
    return res.status(400).json({ erro: 'Selecione ao menos um módulo de acesso.' });

  email = email.toLowerCase().trim();
  nome  = nome.trim();

  try {
    const existeSol = await db.query(
      `SELECT id, status FROM solicitacoes_executor WHERE email = $1`,
      [email]
    );
    if (existeSol.rows.length) {
      const st = existeSol.rows[0].status;
      if (st === 'PENDENTE')
        return res.json({ status: 'PENDENTE', mensagem: 'Sua solicitação já está em análise.' });
      if (st === 'APROVADO')
        return res.json({ status: 'APROVADO', mensagem: 'Sua solicitação já foi aprovada! Faça login.' });
      if (st === 'RECUSADO') {
        // Permite nova tentativa — remove o registro recusado
        await db.query(`DELETE FROM solicitacoes_executor WHERE id = $1`, [existeSol.rows[0].id]);
      }
    }

    const existeUser = await db.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      [email]
    );
    if (existeUser.rows.length)
      return res.status(400).json({ erro: 'Este e-mail já está em uso no sistema.' });

    const r = await db.query(
      `INSERT INTO solicitacoes_executor (nome, email, senha, funcoes, status)
       VALUES ($1, $2, $3, $4::TEXT[], 'PENDENTE')
       RETURNING id`,
      [nome, email, senha, funcoes]
    );

    await notificarAdmins(
      'solicitacao_executor',
      '👤 Nova solicitação de colaborador',
      `${nome} (${email}) solicitou acesso. Módulos: ${funcoes.join(', ')}.`
    );

    enviarEmail(() => emailAdminNovaSolicitacaoExecutor({
      adminEmail: process.env.EMAIL_ADMIN,
      nomeExecutor: nome,
      emailExecutor: email,
      funcoes,
    }));

    return res.json({
      status: 'PENDENTE',
      solicitacaoId: r.rows[0].id,
      mensagem: 'Solicitação enviada com sucesso! Aguarde a aprovação do administrador.',
    });
  } catch (e) {
    if (e.code === '23505')
      return res.status(400).json({ erro: 'Este e-mail já possui uma solicitação.' });
    console.error('[solicitacoes-executor POST]', e.message);
    return res.status(500).json({ erro: 'Erro interno ao salvar solicitação.' });
  }
});

// ── GET /api/solicitacoes-executor/status?email=x ────────────
router.get('/status', async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ erro: 'Informe o e-mail.' });
  try {
    const r = await db.query(
      `SELECT id, nome, status FROM solicitacoes_executor WHERE email = $1`,
      [email]
    );
    if (!r.rows.length)
      return res.status(404).json({ erro: 'Nenhuma solicitação encontrada com este e-mail.' });
    return res.json({ status: r.rows[0].status, nome: r.rows[0].nome });
  } catch (e) {
    console.error('[solicitacoes-executor GET /status]', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ── GET /api/solicitacoes-executor/pendentes/contagem ────────
router.get('/pendentes/contagem', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) AS total FROM solicitacoes_executor WHERE status = 'PENDENTE'`
    );
    return res.json({ total: parseInt(r.rows[0].total, 10) });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ── GET /api/solicitacoes-executor ───────────────────────────
router.get('/', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  const { status } = req.query;
  try {
    const params = [];
    let where = '';
    if (status) { where = 'WHERE status = $1'; params.push(status); }
    const r = await db.query(
      `SELECT id, nome, email, funcoes, status, criado_em, resolvido_em
       FROM solicitacoes_executor ${where} ORDER BY criado_em DESC`,
      params
    );
    return res.json({ solicitacoes: r.rows });
  } catch (e) {
    console.error('[solicitacoes-executor GET /]', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

// ── POST /api/solicitacoes-executor/:id/aprovar ──────────────
router.post('/:id/aprovar', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  const { id } = req.params;
  try {
    const sol = await db.query(`SELECT * FROM solicitacoes_executor WHERE id = $1`, [id]);
    if (!sol.rows.length)
      return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    const s = sol.rows[0];
    if (s.status !== 'PENDENTE')
      return res.status(400).json({ erro: 'Esta solicitação já foi processada.' });

    const existeUser = await db.query(`SELECT id FROM usuarios WHERE email = $1`, [s.email]);
    if (existeUser.rows.length)
      return res.status(400).json({ erro: 'Este e-mail já está em uso por outro executor.' });

    const novoUser = await db.query(
      `INSERT INTO usuarios (nome, email, senha, funcoes, ativo) VALUES ($1,$2,$3,$4::TEXT[],TRUE) RETURNING id`,
      [s.nome, s.email, s.senha, s.funcoes]
    );
    const executorId = novoUser.rows[0].id;

    await db.query(
      `UPDATE solicitacoes_executor SET status='APROVADO', resolvido_em=NOW() WHERE id=$1`,
      [id]
    );

    await notificar(executorId, 'conta_criada', '🎉 Sua conta foi aprovada!',
      `Bem-vindo ao FlowProd, ${s.nome}! Módulos: ${s.funcoes.join(', ')}. Faça login.`
    );

    enviarEmail(() => emailExecutorAprovado({
      emailExecutor: s.email,
      nomeExecutor: s.nome,
      funcoes: s.funcoes,
    }));

    await logAdmin(req.usuario.id, 'APROVAR_SOLICITACAO_EXECUTOR',
      `Solicitação de ${s.nome} (${s.email}) aprovada. ID ${executorId}.`
    );

    return res.json({ mensagem: `Conta de ${s.nome} criada com sucesso!`, executorId, email: s.email });
  } catch (e) {
    console.error('[solicitacoes-executor POST /:id/aprovar]', e.message);
    return res.status(500).json({ erro: 'Erro interno ao aprovar.' });
  }
});

// ── POST /api/solicitacoes-executor/:id/recusar ──────────────
router.post('/:id/recusar', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  const { id } = req.params;
  try {
    const sol = await db.query(`SELECT * FROM solicitacoes_executor WHERE id = $1`, [id]);
    if (!sol.rows.length)
      return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    const s = sol.rows[0];
    if (s.status !== 'PENDENTE')
      return res.status(400).json({ erro: 'Esta solicitação já foi processada.' });

    await db.query(
      `UPDATE solicitacoes_executor SET status='RECUSADO', resolvido_em=NOW() WHERE id=$1`,
      [id]
    );

    enviarEmail(() => emailExecutorRecusado({
      emailExecutor: s.email,
      nomeExecutor: s.nome,
    }));

    await logAdmin(req.usuario.id, 'RECUSAR_SOLICITACAO_EXECUTOR',
      `Solicitação de ${s.nome} (${s.email}) recusada.`
    );

    return res.json({ mensagem: `Solicitação de ${s.nome} recusada.` });
  } catch (e) {
    console.error('[solicitacoes-executor POST /:id/recusar]', e.message);
    return res.status(500).json({ erro: 'Erro interno ao recusar.' });
  }
});

// ── DELETE /api/solicitacoes-executor/:id ────────────────────
// Remove um registro de solicitação (apenas resolvidas: APROVADO ou RECUSADO)
router.delete('/:id', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(
      `DELETE FROM solicitacoes_executor WHERE id=$1 AND status <> 'PENDENTE' RETURNING id`,
      [req.params.id]
    );
    if (!r.rows.length)
      return res.status(400).json({ erro: 'Não é possível remover solicitações pendentes.' });
    return res.json({ ok: true });
  } catch (e) {
    console.error('[solicitacoes-executor DELETE]', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
