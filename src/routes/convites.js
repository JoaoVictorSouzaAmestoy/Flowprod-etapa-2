// src/routes/convites.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { autenticar, autorizarFuncao } = require('../middlewares/auth');

// GET /api/convites/por-nome?nome=X — público, executor busca pelo nome
router.get('/por-nome', async (req, res) => {
  const nome = (req.query.nome || '').trim();
  if (!nome || nome.length < 2)
    return res.status(400).json({ erro: 'Informe seu nome completo.' });

  try {
    // Busca usuários com nome parecido (case-insensitive)
    const r = await db.query(
      `SELECT id, nome, email, senha, funcoes FROM usuarios
       WHERE LOWER(nome) = LOWER($1) AND ativo = TRUE
         AND NOT ('ADMIN' = ANY(funcoes))`,
      [nome]
    );

    if (!r.rows.length)
      return res.status(404).json({ erro: 'Nenhuma conta encontrada com este nome. Verifique a grafia exata usada pelo administrador.' });

    if (r.rows.length > 1)
      return res.json({ multiplos: true });

    const u = r.rows[0];
    return res.json({
      nome:    u.nome,
      email:   u.email,
      senha:   u.senha,
      funcoes: u.funcoes,
    });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

// POST /api/convites/gerar/:id — admin regenera convite (mantido para compatibilidade)
router.post('/gerar/:usuario_id', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(
      `SELECT nome, email, senha, funcoes FROM usuarios WHERE id=$1`,
      [req.params.usuario_id]
    );
    if (!r.rows.length) return res.status(404).json({ erro: 'Executor não encontrado.' });
    return res.json(r.rows[0]);
  } catch(e) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
