const { evPedidoCriado } = require('../notificar');
// src/routes/pedidos.js — Pedidos de clientes (rota pública)
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// POST /api/pedidos — qualquer pessoa pode enviar (anônimo)
router.post('/', async (req, res) => {
  const { nome, email, empresa, produto, quantidade, prazo, observacoes } = req.body;

  if (!nome || !email || !produto || !quantidade) {
    return res.status(400).json({ erro: 'Nome, e-mail, produto e quantidade são obrigatórios.' });
  }
  if (quantidade < 1) {
    return res.status(400).json({ erro: 'Quantidade deve ser maior que zero.' });
  }

  try {
    await db.query(
      `INSERT INTO pedidos_cliente (nome, email, empresa, produto, quantidade, prazo, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [nome, email, empresa || null, produto, quantidade, prazo || null, observacoes || null]
    );
    // Pega nome do cliente para a notificação
    let nomeCliente = 'Cliente';
    try {
      const jwt = require('jsonwebtoken');
      const token = req.cookies?.token_cliente;
      if (token) {
        const p = jwt.verify(token, process.env.JWT_SECRET);
        nomeCliente = p.nome || 'Cliente';
      }
    } catch {}
    await evPedidoCriado(nomeCliente, produto, parseInt(quantidade));
    return res.json({ mensagem: 'Pedido recebido com sucesso!' });
  } catch (erro) {
    console.error('Erro ao salvar pedido:', erro);
    return res.status(500).json({ erro: 'Erro interno ao salvar pedido.' });
  }
});

// GET /api/pedidos — somente FORECAST e ADMIN podem ver
const { autenticar, autorizarFuncao } = require('../middlewares/auth');
router.get('/', autenticar, autorizarFuncao('FORECAST','ADMIN'), async (req, res) => {
  try {
    const resultado = await db.query(
      `SELECT * FROM pedidos_cliente ORDER BY criado_em DESC`
    );
    return res.json({ pedidos: resultado.rows });
  } catch (erro) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
