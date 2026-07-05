const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/colaborador/buscar?nome=João
// Público — executor digita o nome e vê se tem conta criada
router.get('/buscar', async (req, res) => {
  const { nome } = req.query;
  if (!nome || nome.trim().length < 2)
    return res.status(400).json({ erro: 'Informe ao menos 2 caracteres do nome.' });

  try {
    const r = await db.query(
      `SELECT id, nome, email, senha, funcoes, ativo, criado_em
       FROM usuarios
       WHERE LOWER(nome) LIKE LOWER($1)
         AND NOT ('ADMIN' = ANY(funcoes))
         AND ativo = TRUE`,
      [`%${nome.trim()}%`]
    );

    if (!r.rows.length)
      return res.status(404).json({ erro: 'Nenhuma conta encontrada com este nome.' });

    // Retorna os dados — a senha fica visível pois é o primeiro acesso
    return res.json({ usuarios: r.rows });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
