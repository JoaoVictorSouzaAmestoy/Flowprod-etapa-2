// src/email.js — Serviço de envio de e-mails do FlowProd
const nodemailer = require('nodemailer');

// ── Transportador ────────────────────────────────────────────
function criarTransportador() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const DE = () => `"FlowProd" <${process.env.EMAIL_USER}>`;

// ── Templates ─────────────────────────────────────────────────
function templateBase(conteudo) {
  return `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; background:#f5f5f5; margin:0; padding:24px; }
  .card { background:#fff; border-radius:10px; max-width:560px; margin:0 auto; padding:32px; box-shadow:0 2px 12px rgba(0,0,0,.08); }
  .logo { font-size:22px; font-weight:700; color:#1a56db; letter-spacing:-0.5px; }
  .logo span { color:#374151; }
  h2 { margin:20px 0 8px; color:#111; font-size:18px; }
  p  { margin:0 0 12px; color:#444; line-height:1.6; font-size:14px; }
  .box { background:#f0f4ff; border-left:4px solid #1a56db; border-radius:4px; padding:14px 16px; margin:16px 0; }
  .box strong { color:#1a56db; }
  .btn { display:inline-block; background:#1a56db; color:#fff; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:700; font-size:14px; margin-top:8px; }
  .ok  { color:#059669; font-weight:700; }
  .err { color:#dc2626; font-weight:700; }
  .footer { text-align:center; color:#9ca3af; font-size:11px; margin-top:24px; }
</style>
</head>
<body>
  <div class="card">
    <div class="logo">Flow<span>Prod</span></div>
    ${conteudo}
    <div class="footer">FlowProd — Sistema de Gestão de Produção</div>
  </div>
</body>
</html>`;
}

// ── Funções de envio ─────────────────────────────────────────

async function emailAdminNovaSolicitacaoExecutor({ adminEmail, nomeExecutor, emailExecutor, funcoes }) {
  const t = criarTransportador();
  await t.sendMail({
    from: DE(),
    to: adminEmail,
    subject: `[FlowProd] Nova solicitação de colaborador — ${nomeExecutor}`,
    html: templateBase(`
      <h2>📋 Nova solicitação de acesso</h2>
      <p>Um novo colaborador solicitou acesso ao sistema e aguarda sua aprovação.</p>
      <div class="box">
        <strong>Nome:</strong> ${nomeExecutor}<br>
        <strong>E-mail:</strong> ${emailExecutor}<br>
        <strong>Módulos solicitados:</strong> ${funcoes.join(', ')}
      </div>
      <p>Acesse o painel de administração para aprovar ou recusar a solicitação.</p>
      <a class="btn" href="${process.env.APP_URL || 'http://localhost:3000'}/admin.html">Abrir painel admin</a>
    `)
  });
}

async function emailAdminNovaSolicitacaoCliente({ adminEmail, nomeCliente, emailCliente, empresa, mensagem }) {
  const t = criarTransportador();
  await t.sendMail({
    from: DE(),
    to: adminEmail,
    subject: `[FlowProd] Novo interesse de cliente — ${nomeCliente}`,
    html: templateBase(`
      <h2>🏢 Novo interesse de cliente</h2>
      <p>Um cliente manifestou interesse no sistema e aguarda sua aprovação.</p>
      <div class="box">
        <strong>Nome:</strong> ${nomeCliente}<br>
        <strong>E-mail:</strong> ${emailCliente}<br>
        ${empresa ? `<strong>Empresa:</strong> ${empresa}<br>` : ''}
        ${mensagem ? `<strong>Mensagem:</strong> ${mensagem}` : ''}
      </div>
      <p>Acesse o painel de administração para aprovar ou recusar o cadastro.</p>
      <a class="btn" href="${process.env.APP_URL || 'http://localhost:3000'}/admin.html">Abrir painel admin</a>
    `)
  });
}

async function emailExecutorAprovado({ emailExecutor, nomeExecutor, funcoes }) {
  const t = criarTransportador();
  await t.sendMail({
    from: DE(),
    to: emailExecutor,
    subject: `[FlowProd] ✅ Sua conta foi aprovada!`,
    html: templateBase(`
      <h2>🎉 Bem-vindo ao FlowProd, ${nomeExecutor}!</h2>
      <p>Sua solicitação de acesso foi <span class="ok">aprovada</span> pelo administrador.</p>
      <div class="box">
        <strong>E-mail de acesso:</strong> ${emailExecutor}<br>
        <strong>Módulos liberados:</strong> ${funcoes.join(', ')}<br>
        <strong>Senha:</strong> a senha que você escolheu no cadastro
      </div>
      <p>Você já pode fazer login com as suas credenciais.</p>
      <a class="btn" href="${process.env.APP_URL || 'http://localhost:3000'}/login.html">Fazer login</a>
    `)
  });
}

async function emailExecutorRecusado({ emailExecutor, nomeExecutor }) {
  const t = criarTransportador();
  await t.sendMail({
    from: DE(),
    to: emailExecutor,
    subject: `[FlowProd] Solicitação de acesso não aprovada`,
    html: templateBase(`
      <h2>Olá, ${nomeExecutor}</h2>
      <p>Infelizmente sua solicitação de acesso ao FlowProd foi <span class="err">recusada</span> pelo administrador.</p>
      <p>Se acredita que houve um engano, entre em contato diretamente com o administrador do sistema.</p>
    `)
  });
}

async function emailClienteAprovado({ emailCliente, nomeCliente, senhaTemp }) {
  const t = criarTransportador();
  await t.sendMail({
    from: DE(),
    to: emailCliente,
    subject: `[FlowProd] ✅ Seu acesso foi liberado!`,
    html: templateBase(`
      <h2>🎉 Bem-vindo ao FlowProd, ${nomeCliente}!</h2>
      <p>Sua solicitação de acesso foi <span class="ok">aprovada</span>. Você já pode acessar o portal do cliente.</p>
      <div class="box">
        <strong>E-mail:</strong> ${emailCliente}<br>
        <strong>Senha temporária:</strong> ${senhaTemp}
      </div>
      <p>Recomendamos alterar sua senha após o primeiro acesso.</p>
      <a class="btn" href="${process.env.APP_URL || 'http://localhost:3000'}/cliente.html">Acessar portal</a>
    `)
  });
}

async function emailClienteRecusado({ emailCliente, nomeCliente }) {
  const t = criarTransportador();
  await t.sendMail({
    from: DE(),
    to: emailCliente,
    subject: `[FlowProd] Solicitação de acesso não aprovada`,
    html: templateBase(`
      <h2>Olá, ${nomeCliente}</h2>
      <p>Infelizmente sua solicitação de acesso ao FlowProd foi <span class="err">recusada</span>.</p>
      <p>Se tiver dúvidas, entre em contato com o administrador do sistema.</p>
    `)
  });
}

/**
 * Envia e-mail em background — NÃO bloqueia a resposta HTTP.
 * ⚠️  NÃO use "await" ao chamar esta função nas rotas.
 *     Chame assim:  enviarEmail(() => emailXxx({...}));
 */
function enviarEmail(fn) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[email] EMAIL_USER ou EMAIL_PASS não configurado — e-mail ignorado.');
    return;
  }
  // Fire-and-forget: resposta HTTP já foi enviada, e-mail sai em background
  Promise.resolve()
    .then(() => fn())
    .then(() => console.log('[email] ✅ E-mail enviado com sucesso.'))
    .catch(e  => console.error('[email] ❌ Falha ao enviar e-mail:', e.message));
}

module.exports = {
  emailAdminNovaSolicitacaoExecutor,
  emailAdminNovaSolicitacaoCliente,
  emailExecutorAprovado,
  emailExecutorRecusado,
  emailClienteAprovado,
  emailClienteRecusado,
  enviarEmail,
};
