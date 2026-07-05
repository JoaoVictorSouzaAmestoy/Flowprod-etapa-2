# 📨 Sistema de Notificações em Tempo Real com SSE

## 🎯 Como Funciona

### Arquitetura
```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Frontend      │         │   Servidor Node  │         │   Banco de Dados │
│   (Browser)     │         │   (Express)      │         │   (PostgreSQL)   │
└────────┬────────┘         └────────┬─────────┘         └────────┬─────────┘
         │                           │                             │
    1. Abre SSE  ──────────────────>│                             │
         │     /api/notificacoes    │                             │
         │         /stream          │                             │
         │                           │                             │
         │  ✅ Conexão aberta        │                             │
         │<──────────────────────────│                             │
         │  (streaming HTTP)         │                             │
         │                           │                             │
         │                    2. Evento do admin                  │
         │                    (ex: aprovar cliente)               │
         │                           │                             │
         │                           │ 3. Insere no BD            │
         │                           │────────────────────────────>
         │                           │<──────────────────────────┤
         │                           │ 4. Envia via SSE           │
         │  📨 Notificação!          │                             │
         │<──────────────────────────│                             │
         │  (instantânea)            │                             │
         │                           │                             │
    5. Cliente recebe                │                             │
    Atualiza UI                      │                             │
```

### Fluxo Detalhado

#### **Passo 1: Cliente se Conecta ao Stream**
```javascript
// Frontend (tela2.html, admin.html, etc)
const eventSource = new EventSource('/api/notificacoes/stream', { 
  withCredentials: true 
});
```

#### **Passo 2: Servidor Registra Conexão**
```javascript
// Backend (src/sse.js)
function registrarCliente(usuarioId, res) {
  if (!clientes.has(usuarioId)) {
    clientes.set(usuarioId, []);
  }
  clientes.get(usuarioId).push(res);
  console.log(`✅ Cliente registrado: usuário ${usuarioId}`);
}
```

#### **Passo 3: Quando Ocorre uma Ação (ex: Aprovar Cliente)**
```javascript
// Backend (src/routes/clientes.js)
await db.query(`UPDATE clientes SET status='APROVADO'...`);
await evClienteAprovado(id, nome, email); // Chama função de notificação
```

#### **Passo 4: Notificação é Enviada via SSE**
```javascript
// Backend (src/notificar.js)
const { enviarNotificacao } = require('./sse');

enviarNotificacao(usuarioId, {
  id: 123,
  tipo: 'cliente_aprovado',
  titulo: '✅ Cliente Aprovado',
  mensagem: 'Acesso liberado para João Silva',
  lida: false,
  criado_em: new Date()
});
```

#### **Passo 5: Frontend Recebe em Tempo Real**
```javascript
eventSource.addEventListener('message', (e) => {
  const notif = JSON.parse(e.data);
  console.log('📨 Nova notificação:', notif);
  
  // Atualiza badge
  atualizarBadgeNotif();
  
  // Recarrega lista se painel aberto
  if (_notifAbertas) carregarNotif();
});
```

---

## 📊 Estrutura de Dados

### Notificação (objeto JSON)
```json
{
  "id": 123,
  "usuario_id": 5,
  "tipo": "cliente_aprovado",
  "titulo": "✅ Cliente Aprovado",
  "mensagem": "Acesso liberado para João Silva",
  "lida": false,
  "criado_em": "2026-03-27T10:30:00Z"
}
```

### Tabela `notificacoes` (PostgreSQL)
```sql
CREATE TABLE notificacoes (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  tipo VARCHAR(50),
  titulo TEXT NOT NULL,
  mensagem TEXT,
  lida BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Ciclo Completo de uma Notificação

1. **Admin aprovaa cliente** → `POST /api/clientes/aprovar/3`
2. **Backend** → Insere na tabela `notificacoes`
3. **SSE** → Envia evento para cliente conectado
4. **Frontend** → Recebe `message` event
5. **UI** → Badge atualiza + lista recarrega
6. **Usuário** → Vê notificação em tempo real ⚡

---

## 🧪 Tipos de Notificações Implementadas

| Tipo | Disparo | Destinatário |
|------|---------|--------------|
| `cliente_interesse` | Cliente envia interesse | Admins |
| `cliente_aprovado` | Admin aprova cliente | Admins |
| `senha_alterada` | Senha do usuário alterada | Próprio usuário |
| `conta_criada` | Admin cria conta | Usuário novo |
| `solicitacao_senha` | Executor pede redefinição | Admins |

---

## 📡 Rota SSE

### `GET /api/notificacoes/stream`
- **Autenticação**: Token JWT obrigatório
- **Tipo**: Server-Sent Events (texto/event-stream)
- **Comportamento**: Mantém conexão aberta, envia eventos quando ocorrem
- **Timeout**: Reconecta automaticamente a cada 5s se cair
- **Ping**: Envia heartbeat a cada 30s para evitar timeout

---

## 🚀 Como Testar

### Opção 1: Via Form de Admin
1. Acesse `/admin.html`
2. Vá para "Gerenciar Clientes"
3. Clique em "Aprovar" em um cliente pendente
4. Veja a notificação aparecer em tempo real! ✨

### Opção 2: Via Rota de Teste
1. `POST /api/test/notificacao?usuario_id=1&titulo=Teste&mensagem=Msg`
2. Notificação aparece instantaneamente em todos os clientes conectados

---

## 📝 Logs que Você Verá

```
✅ Conectado ao stream de notificações em tempo real
📨 Nova notificação em tempo real: { id: 123, titulo: "...", ... }
⚙️ [SSE] Cliente registrado: usuário 5
📤 [SSE] Enviando notificação para usuário 5
```

---

## ⚙️ Configuração

**Não requer configuração!** O SSE já está:
- ✅ Integrado em todos os arquivos HTML
- ✅ Conectando automaticamente ao carregar página
- ✅ Reconectando automaticamente se cair
- ✅ Enviando emails verificados para banco

---

## 🔧 Para Adicionar Novas Notificações

1. **No backend**, importe e use:
```javascript
const { notificar } = require('./notificar');

await notificar(usuarioId, 'tipo_novo', 'Título', 'Mensagem');
```

2. **Pronto!** A notificação vai:
   - ✅ Salvar no banco
   - ✅ Enviar via SSE em tempo real
   - ✅ Aparecer no frontend instantaneamente

---

## 📊 Monitoramento

Para ver conexões SSE ativas em tempo real:
```bash
# Adicione isto no src/sse.js
console.log(`📊 Conexões SSE ativas: ${clientes.size}`);
```

---

## ✅ Checklist de Funcionamento

- [ ] Servidor node rodando em `localhost:3000`
- [ ] Frontend conectado ao stream SSE
- [ ] Badge atualiza quando notificação chega
- [ ] Notificação persiste no banco de dados
- [ ] Reconexão funciona quando cai
- [ ] Múltiplos usuários recebem suas próprias notificações

