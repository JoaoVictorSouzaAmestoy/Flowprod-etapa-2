const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { autenticar, autorizarFuncao } = require('../middlewares/auth');

router.get('/', autenticar, autorizarFuncao('ADMIN'), async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM logs_admin ORDER BY criado_em DESC LIMIT 100`
    );
    return res.json({ logs: r.rows });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});
module.exports = router;
