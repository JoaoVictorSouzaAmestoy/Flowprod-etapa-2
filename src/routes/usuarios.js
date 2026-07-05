// src/routes/usuarios.js — Rotas de gerenciamento de executores
const express    = require('express');
const router     = express.Router();
const { autenticar, autorizarFuncao } = require('../middlewares/auth');
const { listar, criar, toggleAtivo, remover } = require('../controllers/usuariosController');
const db         = require('../db');
const { logAdmin } = require('../notificar');

// Todas as rotas exigem login E função ADMIN
router.use(autenticar);
router.use(autorizarFuncao('ADMIN'));

// GET    /api/usuarios              — lista todos os executores
router.get('/', listar);

// POST   /api/usuarios              — cria novo executor
router.post('/', criar);

// PATCH  /api/usuarios/:id/toggle   — ativa/desativa
router.patch('/:id/toggle', toggleAtivo);

// DELETE /api/usuarios/:id          — remove executor por ID
router.delete('/:id', remover);

// DELETE /api/usuarios/por-email/:email — remove executor pelo e-mail
// Usado quando a solicitação foi aprovada e o usuário já existe em `usuarios`
router.delete('/por-email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    // Busca o usuário pelo email
    const busca = await db.query(
      `SELECT id, nome, email FROM usuarios WHERE email = $1 AND NOT ('ADMIN'=ANY(funcoes))`,
      [email]
    );

    // Se não existe, retorna 200 silencioso (já foi removido ou nunca existiu)
    if (!busca.rows.length)
      return res.json({ mensagem: 'Usuário não encontrado ou já removido.' });

    const { id, nome } = busca.rows[0];

    // Remove dependências antes de deletar o usuário
    await db.query(`DELETE FROM notificacoes       WHERE usuario_id = $1`, [id]);
    await db.query(`DELETE FROM solicitacoes_senha WHERE usuario_id = $1`, [id]);
    await db.query(`DELETE FROM convites           WHERE usuario_id = $1`, [id]);
    await db.query(`DELETE FROM solicitacoes_executor WHERE email   = $1`, [email]);

    // Remove o usuário
    await db.query(`DELETE FROM usuarios WHERE id = $1`, [id]);

    await logAdmin(req.usuario.id, 'EXECUTOR_REMOVIDO', `${nome} (${email}) removido via solicitação`);

    return res.json({ mensagem: `Executor ${nome} removido.` });
  } catch (e) {
    console.error('[DELETE /usuarios/por-email]', e.message);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;