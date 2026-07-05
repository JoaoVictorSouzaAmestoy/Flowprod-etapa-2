const express = require('express');
const router  = express.Router();
const db      = require('../db');
const jwt     = require('jsonwebtoken');
const { autenticar, autorizarFuncao } = require('../middlewares/auth');
const { evClienteSolicitou, evClienteAprovado, logAdmin } = require('../notificar');
const {
  emailAdminNovaSolicitacaoCliente,
  emailClienteAprovado,
  emailClienteRecusado,
  enviarEmail,
} = require('../email');

// POST /api/clientes/interesse — formulário público
router.post('/interesse', async (req, res) => {
  const { nome, email, empresa, telefone, mensagem } = req.body;
  if (!nome || !email) return res.status(400).json({ erro: 'Nome e e-mail são obrigatórios.' });
  try {
    const existe = await db.query(`SELECT id, status FROM clientes WHERE email=$1`, [email.toLowerCase().trim()]);
    if (existe.rows.length) {
      const st = existe.rows[0].status;
      if (st === 'PENDENTE') return res.json({ status: 'PENDENTE', mensagem: 'Sua solicitação já está em análise.' });
      if (st === 'APROVADO') return res.json({ status: 'APROVADO', mensagem: 'Sua conta já está aprovada! Faça login.' });
      if (st === 'RECUSADO') {
        // Permite nova tentativa — remove o registro recusado
        await db.query(`DELETE FROM clientes WHERE id = $1`, [existe.rows[0].id]);
      }
    }
    const r = await db.query(
      `INSERT INTO clientes (nome, email, empresa, telefone, mensagem_interesse, status)
       VALUES ($1,$2,$3,$4,$5,'PENDENTE') RETURNING id, nome`,
      [nome, email.toLowerCase().trim(), empresa||null, telefone||null, mensagem||null]
    );
    await evClienteSolicitou(nome, email);
    enviarEmail(() => emailAdminNovaSolicitacaoCliente({
      adminEmail: process.env.EMAIL_ADMIN,
      nomeCliente: nome,
      emailCliente: email.toLowerCase().trim(),
      empresa: empresa || null,
      mensagem: mensagem || null,
    }));
    return res.json({ status: 'PENDENTE', clienteId: r.rows[0].id, mensagem: 'Solicitação enviada com sucesso!' });
  } catch(e) {
    if (e.code === '23505') return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
    console.error('Erro /interesse:', e.message);
    return res.status(500).json({ erro: 'Erro interno ao salvar solicitação.' });
  }
});

// GET /api/clientes/status?email=x — polling do cliente (query param)
router.get('/status', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ erro: 'Informe o e-mail.' });
  try {
    const r = await db.query(
      `SELECT id, nome, status, senha FROM clientes WHERE email=$1`,
      [email.toLowerCase().trim()]
    );
    if (!r.rows.length) return res.status(404).json({ erro: 'Não encontrado.' });
    const c = r.rows[0];
    const resp = { status: c.status, nome: c.nome };
    // Retorna a senha temporária apenas quando aprovado (para mostrar na tela)
    if (c.status === 'APROVADO' && c.senha) resp.senha_temp = c.senha;
    return res.json(resp);
  } catch(e) {
    console.error('Erro /status:', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/clientes/login
router.post('/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
  try {
    const r = await db.query(`SELECT * FROM clientes WHERE email=$1`, [email.toLowerCase().trim()]);
    const c = r.rows[0];
    if (!c || c.senha !== senha) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    if (c.status === 'PENDENTE') return res.status(403).json({ erro: 'Sua solicitação ainda está em análise.', status: 'PENDENTE' });
    if (c.status === 'RECUSADO') return res.status(403).json({ erro: 'Sua solicitação foi recusada.', status: 'RECUSADO' });
    if (!c.senha) return res.status(403).json({ erro: 'Acesso ainda não configurado pelo administrador.' });
    const token = jwt.sign(
      { id: c.id, nome: c.nome, email: c.email, tipo: 'CLIENTE' },
      process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    res.cookie('token_cliente', token, { httpOnly:true, secure:false, maxAge:8*60*60*1000, sameSite:'lax' });
    return res.json({ mensagem: 'Login realizado!', redirecionar: '/pedido.html' });
  } catch(e) {
    console.error('Erro /login:', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

// GET /api/clientes/me
router.get('/me', (req, res) => {
  const token = req.cookies?.token_cliente;
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.tipo !== 'CLIENTE') return res.status(403).json({ erro: 'Acesso negado.' });
    return res.json({ cliente: p });
  } catch { return res.status(401).json({ erro: 'Token inválido.' }); }
});

// POST /api/clientes/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token_cliente');
  return res.json({ mensagem: 'Logout realizado.' });
});

// ── ADMIN ─────────────────────────────────────────────────

router.get('/pendentes/contagem', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(`SELECT COUNT(*) AS total FROM clientes WHERE status='PENDENTE'`);
    return res.json({ total: parseInt(r.rows[0].total) });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

router.get('/logs', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(
      `SELECT l.*, u.nome AS admin_nome FROM logs_admin l
       LEFT JOIN usuarios u ON u.id = l.admin_id
       ORDER BY l.criado_em DESC LIMIT 100`
    );
    return res.json({ logs: r.rows });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

router.get('/', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  const { status } = req.query;
  try {
    let query = `SELECT id,nome,email,empresa,telefone,mensagem_interesse,status,criado_em,aprovado_em FROM clientes`;
    const params = [];
    if (status) { query += ` WHERE status=$1`; params.push(status); }
    query += ` ORDER BY CASE status WHEN 'PENDENTE' THEN 0 ELSE 1 END, criado_em DESC`;
    const r = await db.query(query, params);
    return res.json({ clientes: r.rows });
  } catch(e) {
    console.error('Erro GET /clientes:', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

router.post('/aprovar/:id', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  const { senha } = req.body;
  if (!senha || senha.length < 6)
    return res.status(400).json({ erro: 'Defina uma senha de acesso (mín. 6 caracteres).' });
  try {
    const r = await db.query(
      `UPDATE clientes SET status='APROVADO', senha=$1, aprovado_em=NOW()
       WHERE id=$2 AND status='PENDENTE' RETURNING nome, email`,
      [senha, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ erro: 'Não encontrado ou já processado.' });
    const { nome, email } = r.rows[0];
    await logAdmin(req.usuario.id, 'APROVAR_CLIENTE', `Aprovou cliente ${nome} (${email})`);
    await evClienteAprovado(parseInt(req.params.id), nome, email);
    enviarEmail(() => emailClienteAprovado({
      emailCliente: email,
      nomeCliente: nome,
      senhaTemp: senha,
    }));
    return res.json({ mensagem: `Acesso de ${nome} aprovado!`, email, nome });
  } catch(e) {
    console.error('Erro /aprovar:', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

router.post('/recusar/:id', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(
      `UPDATE clientes SET status='RECUSADO' WHERE id=$1 AND status='PENDENTE' RETURNING nome, email`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ erro: 'Não encontrado ou já processado.' });
    await logAdmin(req.usuario.id, 'RECUSAR_CLIENTE', `Recusou cliente ${r.rows[0].nome}`);
    enviarEmail(() => emailClienteRecusado({
      emailCliente: r.rows[0].email,
      nomeCliente: r.rows[0].nome,
    }));
    return res.json({ mensagem: `Solicitação de ${r.rows[0].nome} recusada.` });
  } catch(e) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

router.delete('/:id', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    // Busca email antes de deletar para limpar tabelas relacionadas
    const info = await db.query(`SELECT nome, email FROM clientes WHERE id=$1`, [req.params.id]);
    if (!info.rows.length)
      return res.status(404).json({ erro: 'Cliente não encontrado.' });

    const { nome, email } = info.rows[0];

    await db.query(`DELETE FROM clientes WHERE id=$1`, [req.params.id]);

    // Remove solicitação vinculada ao e-mail para liberar o cadastro futuro
    await db.query(`DELETE FROM solicitacoes_executor WHERE email = $1`, [email]);

    await logAdmin(req.usuario.id, 'REMOVER_CLIENTE', `Removeu cliente ${nome} (${email})`);
    return res.json({ mensagem: 'Cliente removido.' });
  } catch (e) {
    console.error('Erro DELETE /clientes/:id:', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;