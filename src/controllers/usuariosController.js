const db = require('../db');
const { evContaCriada, logAdmin } = require('../notificar');

async function listar(req, res) {
  try {
    const r = await db.query(
      `SELECT id, nome, email, funcoes, ativo, criado_em FROM usuarios
       WHERE NOT ('ADMIN'=ANY(funcoes)) ORDER BY criado_em DESC`
    );
    return res.json({ usuarios: r.rows });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function criar(req, res) {
  const { nome, email, senha, funcoes } = req.body;
  if (!nome || !email || !senha || !funcoes?.length)
    return res.status(400).json({ erro: 'Nome, e-mail, senha e funções são obrigatórios.' });
  if (senha.length < 6)
    return res.status(400).json({ erro: 'Senha mínimo 6 caracteres.' });
  try {
    const r = await db.query(
      `INSERT INTO usuarios (nome, email, senha, funcoes)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [nome, email.toLowerCase().trim(), senha, funcoes]
    );
    const novoId = r.rows[0].id;

    // Evento: conta criada — aparece no sino no primeiro login
    await evContaCriada(novoId, nome, funcoes);
    await logAdmin(req.usuario.id, 'EXECUTOR_CRIADO',
      `${nome} (${email}) criado com módulos: ${funcoes.join(', ')}`
    );

    return res.status(201).json({
      mensagem: `Executor ${nome} criado!`,
      nome, email, senha, funcoes,
    });
  } catch(e) {
    if (e.code === '23505')
      return res.status(400).json({ erro: 'Este e-mail já está cadastrado.' });
    console.error('Erro criar executor:', e.message);
    return res.status(500).json({ erro: 'Erro interno ao criar executor.' });
  }
}

async function toggleAtivo(req, res) {
  try {
    const r = await db.query(
      `UPDATE usuarios SET ativo = NOT ativo WHERE id=$1
       RETURNING nome, ativo, email`,
      [req.params.id]
    );
    if (!r.rows.length)
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const { nome, ativo, email } = r.rows[0];
    await logAdmin(req.usuario.id,
      ativo ? 'EXECUTOR_ATIVADO' : 'EXECUTOR_DESATIVADO',
      `${nome} (${email}) ${ativo ? 'ativado' : 'desativado'}`
    );
    return res.json({ mensagem: `${nome} ${ativo ? 'ativado' : 'desativado'}.`, ativo });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function remover(req, res) {
  const id = parseInt(req.params.id, 10);

  if (isNaN(id)) {
    return res.status(400).json({ erro: 'ID inválido.' });
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const usuario = await client.query(
      `SELECT id, nome, email
       FROM usuarios
       WHERE id = $1`,
      [id]
    );

    if (!usuario.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Executor não encontrado.' });
    }

    const { nome, email } = usuario.rows[0];

    console.log(`🗑 Removendo executor ${nome} (${email})`);

    await client.query(
      `DELETE FROM notificacoes
       WHERE usuario_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM convites
       WHERE usuario_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM solicitacoes_senha
       WHERE usuario_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM solicitacoes_executor
       WHERE email = $1`,
      [email]
    );

    const del = await client.query(
      `DELETE FROM usuarios
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (!del.rows.length) {
      throw new Error('DELETE não removeu nenhuma linha.');
    }

    await client.query('COMMIT');

    await logAdmin(
      req.usuario.id,
      'EXECUTOR_REMOVIDO',
      `${nome} (${email}) removido`
    );

    console.log(`✅ Executor ${nome} removido.`);

    return res.json({
      ok: true,
      mensagem: 'Executor removido com sucesso.'
    });

  } catch (e) {

    await client.query('ROLLBACK');

    console.error(e);

    return res.status(500).json({
      erro: e.message
    });

  } finally {

    client.release();

  }
}

module.exports = {
  listar,
  criar,
  toggleAtivo,
  remover,
};