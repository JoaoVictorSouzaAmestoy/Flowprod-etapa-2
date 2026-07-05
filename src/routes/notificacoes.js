const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { autenticar } = require('../middlewares/auth');

// GET /api/notificacoes
router.get('/', autenticar, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM notificacoes WHERE usuario_id=$1 ORDER BY criado_em DESC LIMIT 50`,
      [req.usuario.id]
    );
    return res.json({ notificacoes: r.rows });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

// GET /api/notificacoes/nao-lidas/contagem
router.get('/nao-lidas/contagem', autenticar, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) AS total FROM notificacoes WHERE usuario_id=$1 AND lida=FALSE`,
      [req.usuario.id]
    );
    return res.json({ total: parseInt(r.rows[0].total) });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

// POST /api/notificacoes/marcar-lidas
router.post('/marcar-lidas', autenticar, async (req, res) => {
  try {
    await db.query(`UPDATE notificacoes SET lida=TRUE WHERE usuario_id=$1`, [req.usuario.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

// DELETE /api/notificacoes/todas — apaga todas do usuário logado
router.delete('/todas', autenticar, async (req, res) => {
  try {
    await db.query(`DELETE FROM notificacoes WHERE usuario_id=$1`, [req.usuario.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

// DELETE /api/notificacoes/:id
router.delete('/:id', autenticar, async (req, res) => {
  try {
    await db.query(`DELETE FROM notificacoes WHERE id=$1 AND usuario_id=$2`,
      [req.params.id, req.usuario.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

// GET /api/notificacoes/stream — SSE para notificações em tempo real
const { registrarCliente, enviarNotificacao } = require('../sse');

router.get('/stream', autenticar, (req, res) => {
  // Headers para SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Registra o cliente
  registrarCliente(req.usuario.id, res);
  
  // Envia ping a cada 30s para manter conexão viva
  const interval = setInterval(() => {
    res.write(': ping\n\n');
  }, 30000);
  
  res.on('close', () => clearInterval(interval));
});

// POST /api/notificacoes/enviar-teste — Admin testa SSE enviando notif para executor
const { notificar } = require('../notificar');

router.post('/enviar-teste', autenticar, async (req, res) => {
  try {
    const { usuario_id, titulo, mensagem } = req.body;
    if (!usuario_id || !titulo) {
      return res.status(400).json({ erro: 'usuario_id e titulo obrigatórios' });
    }
    
    console.log(`\n🧪 [TEST] Admin ${req.usuario.nome} enviando notificação de teste`);
    console.log(`   Para: usuário_id=${usuario_id}`);
    console.log(`   Título: ${titulo}`);
    console.log(`   Mensagem: ${mensagem || '(vazio)'}\n`);
    
    await notificar(usuario_id, 'teste_admin', titulo, mensagem || '');
    
    return res.json({ 
      ok: true, 
      mensagem: 'Notificação enviada',
      usuario_id,
      titulo
    });
  } catch (e) {
    console.error('Erro ao enviar notificação de teste:', e);
    return res.status(500).json({ erro: 'Erro ao enviar notificação' });
  }
});

// ── Rotas para cenários específicos ────────────────────────

router.post('/enviar-admin', autenticar, async (req, res) => {
  try {
    const { tipo, titulo, mensagem } = req.body;
    if (!titulo) return res.status(400).json({ erro: 'Título obrigatório' });
    
    const { notificarAdmins } = require('../notificar');
    await notificarAdmins(tipo || 'evento_sistema', titulo, mensagem || '');
    
    return res.json({ ok: true, mensagem: 'Notificação enviada aos admins' });
  } catch(e) {
    console.error('Erro enviar-admin:', e);
    return res.status(500).json({ erro: 'Erro ao enviar' });
  }
});

router.post('/enviar-executor-conta', autenticar, async (req, res) => {
  try {
    const usuario_id = parseInt(req.body.usuario_id);
    if (!usuario_id) return res.status(400).json({ erro: 'usuario_id obrigatório' });
    
    const { notificar } = require('../notificar');
    await notificar(usuario_id, 'nova_funcao', 
      '🎉 Nova função atribuída!',
      'Uma nova função foi atribuída à sua conta. Verifique suas permissões atualizadas.'
    );
    
    return res.json({ ok: true, mensagem: 'Notificação enviada ao executor' });
  } catch(e) {
    console.error('Erro enviar-executor-conta:', e);
    return res.status(500).json({ erro: 'Erro ao enviar' });
  }
});

router.post('/enviar-nova-funcao', autenticar, async (req, res) => {
  try {
    const usuario_id = parseInt(req.body.usuario_id);
    const funcao = req.body.funcao;
    
    if (!usuario_id || !funcao) {
      return res.status(400).json({ erro: 'usuario_id e funcao obrigatórios' });
    }
    
    const FUNCOES = {
      FORECAST: '📊 Previsão de Demanda',
      PMP: '📋 Plano Mestre de Produção',
      MRP: '🔩 Planejamento de Recursos',
      ESTOQUE: '📦 Gestão de Estoque',
      CRP: '🏭 Planejamento de Capacidade',
      DASHBOARD: '📈 Visão Geral'
    };
    
    const nomeFuncao = FUNCOES[funcao] || funcao;
    
    const { notificar } = require('../notificar');
    await notificar(usuario_id, 'nova_funcao', 
      `🎉 Nova função: ${nomeFuncao}`,
      `Você recebeu acesso à função ${nomeFuncao}. Explore os novos módulos disponíveis!`
    );
    
    return res.json({ ok: true, mensagem: 'Notificação enviada ao executor' });
  } catch(e) {
    console.error('Erro enviar-nova-funcao:', e);
    return res.status(500).json({ erro: 'Erro ao enviar' });
  }
});

router.post('/enviar-novo-pedido', autenticar, async (req, res) => {
  try {
    const { produto } = req.body;
    if (!produto) return res.status(400).json({ erro: 'Produto obrigatório' });
    
    const db = require('../db');
    const { notificar } = require('../notificar');
    
    // Encontra todos os usuários com função FORECAST ou PMP
    const r = await db.query(`
      SELECT id FROM usuarios 
      WHERE ('FORECAST'=ANY(funcoes) OR 'PMP'=ANY(funcoes)) AND ativo=TRUE
    `);
    
    for (const user of r.rows) {
      await notificar(user.id, 'novo_pedido',
        `📋 Novo pedido: ${produto}`,
        `Um novo pedido foi criado para ${produto}. Verifique os detalhes no sistema.`
      );
    }
    
    return res.json({ ok: true, mensagem: 'Notificação enviada ao depart. de Forecast' });
  } catch(e) {
    console.error('Erro enviar-novo-pedido:', e);
    return res.status(500).json({ erro: 'Erro ao enviar' });
  }
});

module.exports = router;

// ── Rotas para o CLIENTE (usa token_cliente) ─────────────────
const jwt = require('jsonwebtoken');

function autenticarCliente(req, res, next) {
  const token = req.cookies?.token_cliente;
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' });
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.tipo !== 'CLIENTE') return res.status(403).json({ erro: 'Acesso negado.' });
    req.cliente = p;
    next();
  } catch { return res.status(401).json({ erro: 'Token inválido.' }); }
}

// Tabela separada: notificacoes_cliente
router.get('/cliente', autenticarCliente, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM notificacoes_cliente WHERE cliente_id=$1 ORDER BY criado_em DESC LIMIT 30`,
      [req.cliente.id]
    );
    return res.json({ notificacoes: r.rows });
  } catch(e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

router.get('/cliente/nao-lidas', autenticarCliente, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT COUNT(*) AS total FROM notificacoes_cliente WHERE cliente_id=$1 AND lida=FALSE`,
      [req.cliente.id]
    );
    return res.json({ total: parseInt(r.rows[0].total) });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

router.post('/cliente/marcar-lidas', autenticarCliente, async (req, res) => {
  try {
    await db.query(`UPDATE notificacoes_cliente SET lida=TRUE WHERE cliente_id=$1`, [req.cliente.id]);
    return res.json({ mensagem: 'Marcadas como lidas.' });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});

router.delete('/cliente/todas', autenticarCliente, async (req, res) => {
  try {
    await db.query(`DELETE FROM notificacoes_cliente WHERE cliente_id=$1`, [req.cliente.id]);
    return res.json({ ok: true });
  } catch { return res.status(500).json({ erro: 'Erro interno.' }); }
});
