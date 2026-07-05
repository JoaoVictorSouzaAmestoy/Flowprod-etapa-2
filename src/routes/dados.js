// src/routes/dados.js — Rotas dos módulos do sistema
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { autenticar } = require('../middlewares/auth');

router.use(autenticar);

// ── PEDIDOS ───────────────────────────────────────────────
router.get('/pedidos', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM pedidos_cliente ORDER BY criado_em DESC');
    res.json({ pedidos: r.rows });
  } catch(e) { res.status(500).json({ erro: 'Erro ao buscar pedidos.' }); }
});

router.post('/pedidos', async (req,res) => {
  const { cliente_nome, produto, quantidade, prazo, observacoes } = req.body;
  if (!cliente_nome||!produto||!quantidade||!prazo) return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
  try {
    const r = await db.query(
      `INSERT INTO pedidos_cliente (cliente_nome,produto,quantidade,prazo,observacoes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [cliente_nome, produto, quantidade, prazo, observacoes||null]
    );
    res.status(201).json({ mensagem: 'Pedido criado!', pedido: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao criar pedido.' }); }
});

// ── FORECAST ──────────────────────────────────────────────
router.get('/forecast', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM forecast ORDER BY criado_em DESC');
    res.json({ forecast: r.rows });
  } catch(e) { res.status(500).json({ erro: 'Erro ao buscar forecast.' }); }
});

router.post('/forecast', async (req,res) => {
  const { pedido_id, demanda_prevista, data_inicio, prazo_limite, observacoes } = req.body;
  if (!demanda_prevista||!data_inicio||!prazo_limite) return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
  try {
    const r = await db.query(
      `INSERT INTO forecast (pedido_id,demanda_prevista,data_inicio,prazo_limite,observacoes,criado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [pedido_id||null, demanda_prevista, data_inicio, prazo_limite, observacoes||null, req.usuario.id]
    );
    // Atualiza status do pedido para EM_ANALISE
    if (pedido_id) {
      await db.query(`UPDATE pedidos_cliente SET status='EM_ANALISE' WHERE id=$1`, [pedido_id]);
    }
    res.status(201).json({ mensagem: 'Forecast registrado!', forecast: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao registrar forecast.' }); }
});

// ── PLANO MESTRE ──────────────────────────────────────────
router.get('/plano', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM plano_mestre ORDER BY criado_em DESC');
    res.json({ planos: r.rows });
  } catch(e) { res.status(500).json({ erro: 'Erro ao buscar planos.' }); }
});

router.post('/plano', async (req,res) => {
  const { forecast_id, descricao, status } = req.body;
  try {
    const r = await db.query(
      `INSERT INTO plano_mestre (forecast_id,descricao,status,criado_por)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [forecast_id||null, descricao||null, status||'RASCUNHO', req.usuario.id]
    );
    res.status(201).json({ mensagem: 'Plano criado!', plano: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao criar plano.' }); }
});

// ── MRP ───────────────────────────────────────────────────
router.get('/mrp', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM mrp ORDER BY criado_em DESC');
    res.json({ mrp: r.rows });
  } catch(e) { res.status(500).json({ erro: 'Erro ao buscar MRP.' }); }
});

router.post('/mrp', async (req,res) => {
  const { plano_id, estoque_id, quantidade_necessaria, situacao } = req.body;
  if (!quantidade_necessaria) return res.status(400).json({ erro: 'Quantidade necessária é obrigatória.' });
  try {
    const r = await db.query(
      `INSERT INTO mrp (plano_id,estoque_id,quantidade_necessaria,situacao)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [plano_id||null, estoque_id||null, quantidade_necessaria, situacao||'OK']
    );
    res.status(201).json({ mensagem: 'Item MRP registrado!', mrp: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao registrar MRP.' }); }
});

// ── ESTOQUE ───────────────────────────────────────────────
router.get('/estoque', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM estoque ORDER BY materia_prima ASC');
    res.json({ estoque: r.rows });
  } catch(e) { res.status(500).json({ erro: 'Erro ao buscar estoque.' }); }
});

router.post('/estoque', async (req,res) => {
  const { materia_prima, unidade, quantidade_atual, quantidade_minima } = req.body;
  if (!materia_prima||!unidade) return res.status(400).json({ erro: 'Nome e unidade são obrigatórios.' });
  try {
    const r = await db.query(
      `INSERT INTO estoque (materia_prima,unidade,quantidade_atual,quantidade_minima)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [materia_prima, unidade, quantidade_atual||0, quantidade_minima||0]
    );
    res.status(201).json({ mensagem: 'Item adicionado ao estoque!', item: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao adicionar item.' }); }
});

router.patch('/estoque/:id', async (req,res) => {
  const { quantidade_atual } = req.body;
  try {
    const r = await db.query(
      `UPDATE estoque SET quantidade_atual=$1, atualizado_em=NOW() WHERE id=$2 RETURNING *`,
      [quantidade_atual, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ erro: 'Item não encontrado.' });
    res.json({ mensagem: 'Estoque atualizado!', item: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao atualizar estoque.' }); }
});

// ── ORDENS DE PRODUÇÃO ────────────────────────────────────
router.get('/ordens', async (req,res) => {
  try {
    const r = await db.query('SELECT * FROM ordens_producao ORDER BY criado_em DESC');
    res.json({ ordens: r.rows });
  } catch(e) { res.status(500).json({ erro: 'Erro ao buscar ordens.' }); }
});

router.post('/ordens', async (req,res) => {
  const { mrp_id, tipo, status } = req.body;
  if (!tipo) return res.status(400).json({ erro: 'Tipo de ordem é obrigatório.' });
  try {
    const r = await db.query(
      `INSERT INTO ordens_producao (mrp_id,tipo,status,criado_por)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [mrp_id||null, tipo, status||'ABERTA', req.usuario.id]
    );
    res.status(201).json({ mensagem: 'Ordem emitida!', ordem: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao emitir ordem.' }); }
});

router.patch('/ordens/:id/status', async (req,res) => {
  const { status } = req.body;
  try {
    const r = await db.query(
      `UPDATE ordens_producao SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ erro: 'Ordem não encontrada.' });
    res.json({ mensagem: 'Status atualizado!', ordem: r.rows[0] });
  } catch(e) { res.status(500).json({ erro: 'Erro ao atualizar ordem.' }); }
});

// ── TESTE SSE — Enviar notificação de teste ──────────────
const { notificar } = require('../notificar');

router.post('/test/notificacao', autenticar, async (req,res) => {
  const { titulo, mensagem, tipo } = req.body;
  if (!titulo) return res.status(400).json({ erro: 'Informe o título.' });
  
  console.log(`\n🧪 [TEST] Enviando notificação de TESTE...`);
  await notificar(
    req.usuario.id,
    tipo || 'teste',
    titulo,
    mensagem || 'Esta é uma notificação de teste'
  );
  
  res.json({ 
    mensagem: 'Notificação de teste enviada!',
    enviada_para: req.usuario.nome,
    usuario_id: req.usuario.id
  });
});

module.exports = router;
