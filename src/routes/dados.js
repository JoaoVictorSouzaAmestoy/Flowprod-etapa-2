// src/routes/dados.js — Rotas dos módulos do sistema
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { autenticar } = require('../middlewares/auth');

router.use(autenticar);

// ── PEDIDOS ───────────────────────────────────────────────
// (As rotas de pedidos vivem em src/routes/pedidos.js, montadas em /api/pedidos.
//  Removidas daqui as rotas antigas que gravavam em "pedidos_cliente" —
//  essa tabela não existe mais no schema atual.)

// ── FORECAST ──────────────────────────────────────────────

// GET /api/forecast/pendentes — itens de pedidos do Comercial que AINDA
// não têm forecast criado. É essa lista que alimenta a tela de Forecast.
router.get('/forecast/pendentes', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT pi.id            AS pedido_item_id,
             pi.produto,
             pi.quantidade,
             pi.unidade,
             p.id             AS pedido_id,
             p.numero          AS pedido_numero,
             p.data_desejada,
             p.observacoes    AS pedido_observacoes,
             p.status         AS pedido_status,
             c.nome           AS cliente_nome,
             c.empresa        AS cliente_empresa
      FROM pedido_itens pi
      JOIN pedidos  p ON p.id = pi.pedido_id
      JOIN clientes c ON c.id = p.cliente_id
      WHERE NOT EXISTS (
        SELECT 1 FROM forecast f WHERE f.pedido_item_id = pi.id
      )
      AND p.status NOT IN ('CANCELADO')
      ORDER BY p.criado_em ASC
    `);
    res.json({ itens: r.rows });
  } catch (e) {
    console.error('Erro ao buscar itens pendentes de forecast:', e.message);
    res.status(500).json({ erro: 'Erro ao buscar itens pendentes de forecast.' });
  }
});

// GET /api/forecast — lista os forecasts já criados, com dados do item/pedido/cliente
router.get('/forecast', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT f.id, f.pedido_item_id, f.produto, f.demanda_prevista,
             f.data_inicio, f.prazo_limite, f.observacoes, f.status,
             f.criado_por, f.criado_em,
             p.id     AS pedido_id,
             p.numero AS pedido_numero,
             c.nome   AS cliente_nome
      FROM forecast f
      LEFT JOIN pedido_itens pi ON pi.id = f.pedido_item_id
      LEFT JOIN pedidos      p  ON p.id  = pi.pedido_id
      LEFT JOIN clientes     c  ON c.id  = p.cliente_id
      ORDER BY f.criado_em DESC
    `);
    res.json({ forecast: r.rows });
  } catch (e) {
    console.error('Erro ao buscar forecast:', e.message);
    res.status(500).json({ erro: 'Erro ao buscar forecast.' });
  }
});

// POST /api/forecast — cria uma previsão de demanda a partir de um item de pedido
router.post('/forecast', async (req, res) => {
  const { pedido_item_id, demanda_prevista, data_inicio, prazo_limite, observacoes } = req.body;

  if (!pedido_item_id || !demanda_prevista || !data_inicio || !prazo_limite) {
    return res.status(400).json({ erro: 'Informe pedido_item_id, demanda_prevista, data_inicio e prazo_limite.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Busca o item + produto + pedido dono (também valida que o item existe)
    const itemRes = await client.query(
      `SELECT pi.id, pi.produto, pi.pedido_id
       FROM pedido_itens pi WHERE pi.id = $1`,
      [pedido_item_id]
    );
    if (!itemRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Item de pedido não encontrado.' });
    }
    const item = itemRes.rows[0];

    // Bloqueia forecast duplicado para o mesmo item
    const existente = await client.query(
      `SELECT id FROM forecast WHERE pedido_item_id = $1`,
      [pedido_item_id]
    );
    if (existente.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Este item já possui um forecast registrado.' });
    }

    const r = await client.query(
      `INSERT INTO forecast (pedido_item_id, produto, demanda_prevista, data_inicio, prazo_limite, observacoes, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [pedido_item_id, item.produto, demanda_prevista, data_inicio, prazo_limite, observacoes || null, req.usuario.id]
    );

    // Se o pedido ainda está como SOLICITADO, avança para EM_ANALISE
    await client.query(
      `UPDATE pedidos SET status = 'EM_ANALISE', atualizado_em = NOW()
       WHERE id = $1 AND status = 'SOLICITADO'`,
      [item.pedido_id]
    );

    await client.query('COMMIT');
    res.status(201).json({ mensagem: 'Forecast registrado!', forecast: r.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Erro ao registrar forecast:', e.message);
    res.status(500).json({ erro: 'Erro ao registrar forecast.' });
  } finally {
    client.release();
  }
});

// PATCH /api/forecast/:id/status — aprova ou marca para revisão
router.patch('/forecast/:id/status', async (req, res) => {
  const { status } = req.body;
  const validos = ['PENDENTE', 'APROVADO', 'REVISAO'];
  if (!validos.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }
  try {
    const r = await db.query(
      `UPDATE forecast SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ erro: 'Forecast não encontrado.' });
    res.json({ mensagem: 'Status atualizado!', forecast: r.rows[0] });
  } catch (e) {
    console.error('Erro ao atualizar status do forecast:', e.message);
    res.status(500).json({ erro: 'Erro ao atualizar status do forecast.' });
  }
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
