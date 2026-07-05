const db = require('../db');
const {
  evSenhaAlterada, evSolicitacaoSenha, evAlertaSeguranca, logAdmin
} = require('../notificar');
const { enviarEmail } = require('../email');
const nodemailer = require('nodemailer');

function criarTransportador() {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
}

function templateBase(conteudo) {
  return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
<style>body{font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:10px;max-width:560px;margin:0 auto;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.logo{font-size:22px;font-weight:700;color:#1a56db;letter-spacing:-0.5px}.logo span{color:#374151}
h2{margin:20px 0 8px;color:#111;font-size:18px}p{margin:0 0 12px;color:#444;line-height:1.6;font-size:14px}
.box{background:#f0f4ff;border-left:4px solid #1a56db;border-radius:4px;padding:14px 16px;margin:16px 0}
.box strong{color:#1a56db}.btn{display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;margin-top:8px}
.ok{color:#059669;font-weight:700}.err{color:#dc2626;font-weight:700}
.footer{text-align:center;color:#9ca3af;font-size:11px;margin-top:24px}</style>
</head><body><div class="card"><div class="logo">Flow<span>Prod</span></div>
${conteudo}<div class="footer">FlowProd — Sistema de Gestão de Produção</div></div></body></html>`;
}

async function emailSenhaAprovada({ emailExecutor, nomeExecutor }) {
  const t = criarTransportador();
  await t.sendMail({
    from: `"FlowProd" <${process.env.EMAIL_USER}>`,
    to: emailExecutor,
    subject: '[FlowProd] 🔑 Sua senha foi redefinida',
    html: templateBase(`
      <h2>🔑 Senha redefinida com sucesso</h2>
      <p>Olá, <strong>${nomeExecutor}</strong>! Sua senha de acesso ao FlowProd foi <span class="ok">redefinida</span> pelo administrador.</p>
      <div class="box">
        <strong>Como acessar sua nova senha:</strong><br>
        Acesse a página de <strong>Primeiro Acesso</strong> com seu código de convite,
        ou peça um novo código ao administrador.
      </div>
      <p>Após obter sua nova senha, faça login normalmente.</p>
      <a class="btn" href="${process.env.APP_URL || 'http://localhost:3000'}/login.html">Ir para o Login</a>
    `)
  });
}

async function emailSenhaRecusada({ emailExecutor, nomeExecutor }) {
  const t = criarTransportador();
  await t.sendMail({
    from: `"FlowProd" <${process.env.EMAIL_USER}>`,
    to: emailExecutor,
    subject: '[FlowProd] Solicitação de senha não aprovada',
    html: templateBase(`
      <h2>Olá, ${nomeExecutor}</h2>
      <p>Sua solicitação de redefinição de senha foi <span class="err">recusada</span> pelo administrador.</p>
      <p>Se acredita que houve um engano ou continua com dificuldades de acesso, entre em contato com o administrador do sistema.</p>
    `)
  });
}

// POST /api/senha/solicitar — executor pede redefinição
async function solicitar(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ erro: 'Informe o e-mail.' });
  try {
    const r = await db.query(
      `SELECT id, nome, email FROM usuarios
       WHERE email=$1 AND ativo=TRUE AND NOT ('ADMIN'=ANY(funcoes))`,
      [email.toLowerCase().trim()]
    );
    if (!r.rows.length)
      return res.json({ mensagem: 'Se o e-mail existir, a solicitação foi enviada ao administrador.' });

    const { id, nome } = r.rows[0];

    const pendente = await db.query(
      `SELECT id FROM solicitacoes_senha WHERE usuario_id=$1 AND status='PENDENTE'`,
      [id]
    );
    if (pendente.rows.length)
      return res.json({ mensagem: 'Já existe uma solicitação pendente. Aguarde o administrador.' });

    await db.query(`INSERT INTO solicitacoes_senha (usuario_id) VALUES ($1)`, [id]);

    // Evento: notifica admins
    await evSolicitacaoSenha(nome, email);

    return res.json({ mensagem: 'Solicitação enviada! O administrador redefinirá sua senha em breve.' });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/senha/solicitacoes — admin lista
async function listarSolicitacoes(req, res) {
  try {
    const r = await db.query(
      `SELECT s.id, s.status, s.criado_em, s.resolvido_em,
              u.id AS usuario_id, u.nome, u.email, u.funcoes
       FROM solicitacoes_senha s
       JOIN usuarios u ON u.id = s.usuario_id
       ORDER BY CASE s.status WHEN 'PENDENTE' THEN 0 ELSE 1 END, s.criado_em DESC`
    );
    return res.json({ solicitacoes: r.rows });
  } catch(e) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/senha/aprovar/:id — admin aprova
async function aprovar(req, res) {
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 6)
    return res.status(400).json({ erro: 'Nova senha mínimo 6 caracteres.' });
  try {
    const sol = await db.query(
      `SELECT s.*, u.nome FROM solicitacoes_senha s
       JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.id=$1 AND s.status='PENDENTE'`,
      [req.params.id]
    );
    if (!sol.rows.length)
      return res.status(404).json({ erro: 'Solicitação não encontrada ou já resolvida.' });

    const { usuario_id, nome } = sol.rows[0];

    await db.query(`UPDATE usuarios SET senha=$1 WHERE id=$2`, [nova_senha, usuario_id]);
    await db.query(
      `UPDATE solicitacoes_senha SET status='APROVADA', nova_senha=$1, resolvido_em=NOW() WHERE id=$2`,
      [nova_senha, req.params.id]
    );

    // Evento: notifica executor que senha foi alterada
    await evSenhaAlterada(usuario_id, nome);
    await logAdmin(req.usuario.id, 'SENHA_REDEFINIDA', `Redefiniu senha de ${nome}`);

    // E-mail para o executor
    const userRow = await db.query(`SELECT email FROM usuarios WHERE id=$1`, [usuario_id]);
    if (userRow.rows.length) {
      await enviarEmail(() => emailSenhaAprovada({
        emailExecutor: userRow.rows[0].email,
        nomeExecutor: nome,
      }));
    }

    return res.json({ mensagem: `Senha de ${nome} redefinida!`, usuario_id });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/senha/recusar/:id
async function recusar(req, res) {
  try {
    const r = await db.query(
      `UPDATE solicitacoes_senha SET status='RECUSADA', resolvido_em=NOW()
       WHERE id=$1 AND status='PENDENTE' RETURNING id`,
      [req.params.id]
    );
    if (!r.rows.length)
      return res.status(404).json({ erro: 'Não encontrada ou já resolvida.' });
    await logAdmin(req.usuario.id, 'SENHA_RECUSADA', `Recusou solicitação id=${req.params.id}`);

    // E-mail para o executor informando recusa
    const solInfo = await db.query(
      `SELECT u.email, u.nome FROM solicitacoes_senha s JOIN usuarios u ON u.id=s.usuario_id WHERE s.id=$1`,
      [req.params.id]
    );
    if (solInfo.rows.length) {
      await enviarEmail(() => emailSenhaRecusada({
        emailExecutor: solInfo.rows[0].email,
        nomeExecutor: solInfo.rows[0].nome,
      }));
    }

    return res.json({ mensagem: 'Solicitação recusada.' });
  } catch(e) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/senha/pendentes/contagem
async function contarPendentes(req, res) {
  try {
    const r = await db.query(
      `SELECT COUNT(*) AS total FROM solicitacoes_senha WHERE status='PENDENTE'`
    );
    return res.json({ total: parseInt(r.rows[0].total) });
  } catch {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/senha/nao-fui-eu — executor alerta que não solicitou a troca
async function naoFuiEu(req, res) {
  try {
    // Pega o usuário logado pelo token
    const usuario_id = req.usuario.id;
    const nome       = req.usuario.nome;

    // Marca a notificação como lida e cria alerta de segurança
    await evAlertaSeguranca(usuario_id, nome);
    await logAdmin(null, 'ALERTA_SEGURANCA',
      `${nome} (id=${usuario_id}) reportou alteração de senha não autorizada`
    );

    return res.json({ mensagem: 'Alerta enviado ao administrador. Aguarde o contato.' });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { solicitar, listarSolicitacoes, aprovar, recusar, contarPendentes, naoFuiEu };
