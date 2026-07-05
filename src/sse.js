// src/sse.js — Gerenciador de conexões SSE para notificações em tempo real
const clientes = new Map(); // { usuario_id: [res1, res2, ...] }

function registrarCliente(usuarioId, res) {
  if (!clientes.has(usuarioId)) {
    clientes.set(usuarioId, []);
  }
  clientes.get(usuarioId).push(res);
  console.log(`\n📡 [SSE] ✅ Cliente registrado: usuário_id=${usuarioId}`);
  console.log(`📊 [SSE] Conexões ativas: ${clientes.size} grupos de usuários`);

  const remover = () => {
    const lista = clientes.get(usuarioId);
    if (!lista) return;
    const idx = lista.indexOf(res);
    if (idx !== -1) {
      lista.splice(idx, 1);
      console.log(`\n📡 [SSE] ❌ Cliente desconectado: usuário_id=${usuarioId}`);
    }
    if (lista.length === 0) {
      clientes.delete(usuarioId);
      console.log(`📊 [SSE] Conexões ativas: ${clientes.size} grupos de usuários\n`);
    }
  };

  res.on('close', remover);
  res.on('error', remover); // evita crash por socket morto
}

function enviarNotificacao(usuarioId, notificacao) {
  const lista = clientes.get(usuarioId);
  if (!lista || lista.length === 0) {
    console.log(`⚠️  [SSE] Usuário ${usuarioId} não tem conexão SSE ativa (offline)`);
    return;
  }

  const evento = `data: ${JSON.stringify(notificacao)}\n\n`;

  // Itera em cópia para evitar mutação caso uma conexão caia durante o loop
  [...lista].forEach(res => {
    try {
      res.write(evento);
    } catch (e) {
      console.warn(`⚠️  [SSE] Falha ao escrever para usuário ${usuarioId}:`, e.message);
    }
  });

  console.log(`\n📤 [SSE] ✉️  Notificação enviada para usuário ${usuarioId}`);
  console.log(`   Tipo: ${notificacao.tipo}`);
  console.log(`   Título: ${notificacao.titulo}`);
  console.log(`   Mensagem: ${notificacao.mensagem || 'sem mensagem'}\n`);
}

function enviarParaVarios(usuariosIds, notificacao) {
  console.log(`\n📤 [SSE] Enviando para ${usuariosIds.length} usuários...`);
  usuariosIds.forEach(id => enviarNotificacao(id, notificacao));
}

module.exports = { registrarCliente, enviarNotificacao, enviarParaVarios };
