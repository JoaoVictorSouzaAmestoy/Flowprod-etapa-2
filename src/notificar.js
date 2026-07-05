// src/notificar.js — Central de notificações do FlowProd
// Toda ação importante gera uma notificação aqui.
const db = require('./db');
const { enviarNotificacao, enviarParaVarios } = require('./sse');

// ── Notificação para executor/admin (tabela notificacoes) ──
async function notificar(usuario_id, tipo, titulo, mensagem) {
  try {
    console.log(`\n📬 [NOTIF] Criando notificação para usuário ${usuario_id}`);
    const r = await db.query(
      `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem)
       VALUES ($1, $2, $3, $4) RETURNING id, criado_em`,
      [usuario_id, tipo, titulo, mensagem]
    );
    
    console.log(`   ✅ Salvo no BD com ID: ${r.rows[0].id}`);
    
    // Envia via SSE em tempo real
    if (r.rows.length > 0) {
      const notif = r.rows[0];
      const notifObj = {
        id: notif.id,
        usuario_id,
        tipo,
        titulo,
        mensagem,
        lida: false,
        criado_em: notif.criado_em
      };
      console.log(`   📡 Enviando via SSE...`);
      enviarNotificacao(usuario_id, notifObj);
    }
  } catch(e) { console.error('[notificar]', e.message); }
}

// ── Notificação para cliente (tabela notificacoes_cliente) ─
async function notificarCliente(cliente_id, tipo, titulo, mensagem) {
  try {
    const r = await db.query(
      `INSERT INTO notificacoes_cliente (cliente_id, tipo, titulo, mensagem)
       VALUES ($1, $2, $3, $4) RETURNING id, criado_em`,
      [cliente_id, tipo, titulo, mensagem]
    );
    
    // Nota: Para cliente, seria necessário um sistema SSE separado
    // Por enquanto apenas persiste no banco
  } catch(e) { console.error('[notificarCliente]', e.message); }
}

// ── Notifica todos os admins ativos ───────────────────────
async function notificarAdmins(tipo, titulo, mensagem) {
  try {
    const r = await db.query(
      `SELECT id FROM usuarios WHERE 'ADMIN'=ANY(funcoes) AND ativo=TRUE`
    );
    const adminIds = r.rows.map(a => a.id);
    
    for (const adminId of adminIds) {
      await notificar(adminId, tipo, titulo, mensagem);
    }
  } catch(e) { console.error('[notificarAdmins]', e.message); }
}

// ── Log de ação do admin ──────────────────────────────────
async function logAdmin(admin_id, acao, detalhes) {
  try {
    await db.query(
      `INSERT INTO logs_admin (admin_id, acao, detalhes) VALUES ($1,$2,$3)`,
      [admin_id, acao, detalhes]
    );
  } catch(e) { console.error('[logAdmin]', e.message); }
}

// ══════════════════════════════════════════════════════════
//  EVENTOS — cada ação importante do sistema
// ══════════════════════════════════════════════════════════

// Conta do executor criada pelo admin
async function evContaCriada(executorId, nome, funcoes) {
  await notificar(executorId, 'conta_criada',
    '🎉 Sua conta foi criada!',
    `Bem-vindo ao FlowProd, ${nome}! Acesse o sistema com seu e-mail e senha. Módulos liberados: ${funcoes.join(', ')}.`
  );
}

// Senha do executor alterada pelo admin
async function evSenhaAlterada(executorId, nome) {
  await notificar(executorId, 'senha_alterada',
    '🔑 Sua senha foi alterada',
    `O administrador redefiniu sua senha de acesso.\n\n⚠️ Se você NÃO solicitou essa alteração, clique em "Não fui eu" abaixo para alertar o administrador.`
  );
}

// Executor solicitou redefinição de senha → notifica admin
async function evSolicitacaoSenha(executorNome, executorEmail) {
  await notificarAdmins('solicitacao_senha',
    `🔐 Solicitação de redefinição de senha`,
    `${executorNome} (${executorEmail}) solicitou a redefinição de sua senha de acesso.`
  );
}

// Executor clicou "Não fui eu" → alerta de segurança para admin
async function evAlertaSeguranca(executorId, executorNome) {
  await notificarAdmins('alerta_seguranca',
    `🚨 Possível acesso indevido`,
    `${executorNome} informou que NÃO solicitou a última alteração de senha. Verifique imediatamente o acesso desta conta.`
  );
  // Notifica o próprio executor também
  await notificar(executorId, 'alerta_seguranca',
    '✅ Alerta enviado ao administrador',
    'O administrador foi notificado sobre a possível alteração indevida de senha. Aguarde o contato.'
  );
}

// Cliente solicitou acesso → notifica admin
async function evClienteSolicitou(clienteNome, clienteEmail) {
  await notificarAdmins('cliente_novo',
    `🛒 Nova solicitação de cliente`,
    `${clienteNome} (${clienteEmail}) solicitou acesso ao sistema.`
  );
}

// Cliente aprovado → notifica o cliente
async function evClienteAprovado(clienteId, clienteNome, clienteEmail) {
  await notificarCliente(clienteId, 'acesso_liberado',
    '🎉 Acesso liberado!',
    `Bem-vindo ao FlowProd, ${clienteNome}! Seu acesso foi aprovado. Faça login com o e-mail ${clienteEmail} e a senha definida pelo administrador.`
  );
  await notificarAdmins('cliente_aprovado',
    `✅ Cliente aprovado: ${clienteNome}`,
    `Você aprovou o acesso de ${clienteNome} (${clienteEmail}).`
  );
}

// Pedido criado pelo cliente → notifica responsáveis de Forecast
async function evPedidoCriado(clienteNome, produto, quantidade) {
  try {
    const r = await db.query(
      `SELECT id FROM usuarios WHERE 'FORECAST'=ANY(funcoes) AND ativo=TRUE`
    );
    for (const u of r.rows) {
      await notificar(u.id, 'pedido_novo',
        `📋 Novo pedido recebido`,
        `${clienteNome} enviou um pedido: ${quantidade}x ${produto}.`
      );
    }
    // Admin também recebe
    await notificarAdmins('pedido_novo',
      `📋 Novo pedido: ${produto}`,
      `${clienteNome} enviou um pedido de ${quantidade}x ${produto}.`
    );
  } catch(e) { console.error('[evPedidoCriado]', e.message); }
}

module.exports = {
  // Primitivos
  notificar, notificarCliente, notificarAdmins, logAdmin,
  // Eventos semânticos
  evContaCriada, evSenhaAlterada, evSolicitacaoSenha,
  evAlertaSeguranca, evClienteSolicitou, evClienteAprovado, evPedidoCriado,
  // Alias mantido para compatibilidade
  criarNotificacao: notificar,
  criarNotificacaoCliente: notificarCliente,
};
