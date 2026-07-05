// src/routes/alertas.js — Painel público de alertas
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/alertas — retorna alertas públicos (solicitações de cliente + alteração de senha)
router.get('/', async (req, res) => {
  try {
    // Solicitações de cliente PENDENTES
    const resClientes = await db.query(
      `SELECT id, nome, email, empresa, status, criado_em
       FROM clientes
       WHERE status = 'PENDENTE'
       ORDER BY criado_em DESC`
    );

    // Solicitações de alteração de senha PENDENTES
    const resSenhas = await db.query(
      `SELECT s.id, u.nome, u.email, s.status, s.criado_em
       FROM solicitacoes_senha s
       JOIN usuarios u ON s.usuario_id = u.id
       WHERE s.status = 'PENDENTE'
       ORDER BY s.criado_em DESC`
    );

    res.json({
      clientes: resClientes.rows,
      senhas: resSenhas.rows,
      timestamp: new Date().toISOString()
    });
  } catch(err) {
    console.error('Erro ao buscar alertas:', err);
    res.status(500).json({ erro: 'Erro ao buscar alertas.' });
  }
});

module.exports = router;
