# 🧪 Tutorial Prático - SSE em Tempo Real

## Teste 1: Aprovar um Cliente (Mais Realista)

### Pré-requisitos
- ✅ Servidor rodando (`node server.js` no terminal)
- ✅ Acesso admin + executor criados

### Passos

**1️⃣ Abra 2 abas no navegador:**

Aba A - Admin:
```
http://localhost:3000/admin.html
Login com conta admin
```

Aba B - Executor:
```
http://localhost:3000/tela2.html
Login com conta executor
```

**2️⃣ Na Aba A (Admin):**
- Clique na aba "Clientes"
- Procure um cliente com status "Pendente"
- Clique "Aprovar"
- Observe no terminal:
  ```
  📬 [NOTIF] Criando notificação para usuário 2
     ✅ Salvo no BD com ID: 15
     📡 Enviando via SSE...
  
  📤 [SSE] ✉️  Notificação enviada para usuário 2
  ```

**3️⃣ Na Aba B (Executor) - SEM FAZER NADA:**
- ✅ O número de notificações (badge) atualiza INSTANTANEAMENTE
- ✅ "📬 Nova notificação" aparecia no topo
- ✅ Console (F12) mostra: `📨 Nova notificação em tempo real:`

**4️⃣ Abra as notificações (Aba B):**
- Clique no ícone de sino/notificação
- Veja "✅ Cliente Aprovado" no topo da lista
- A notificação está **em tempo real**

---

## Teste 2: Verificar Logs Completos

**Abra 2 terminais:**

Terminal 1 - Servidor:
```powershell
cd "c:\Users\jvict\Desktop\TCC - Sistema WebPCP\flowprod"
node server.js
```

Terminal 2 - Observe logs:
```
# Veja em tempo real:
📡 [SSE] ✅ Cliente registrado: usuário_id=5
📤 [SSE] ✉️  Notificação enviada para usuário 5
📡 [SSE] ❌ Cliente desconectado: usuário_id=5
```

---

## Teste 3: Múltiplos Usuários

**Abra 4 abas:**
1. Admin (http://localhost:3000/admin.html)
2. Executor1 (http://localhost:3000/tela2.html) - Login user 1
3. Executor2 (http://localhost:3000/tela3.html) - Login user 2
4. Executor3 (http://localhost:3000/tela2.html) - Login user 1 (novamente)

**Teste:**
- Admin aprova cliente
- Executor1 recebe notificação em AMBAS as abas (aba 2 + aba 4)
- Executor2 NÃO recebe nada
- Badges atualizam independentemente

---

## Console JavaScript (F12 → Console)

Você verá logs como:

```javascript
// Quando conecta
✅ Conectado ao stream de notificações em tempo real

// Quando notificação chega
📨 Nova notificação em tempo real: {
  "id": 42,
  "usuario_id": 5,
  "tipo": "cliente_aprovado",
  "titulo": "✅ Cliente Aprovado",
  "mensagem": "Seu cliente foi aprovado!",
  "lida": false,
  "criado_em": "2026-03-27T..."
}
```

---

## Troubleshooting

### Notificação não aparece na Aba B

**Causas possíveis:**
1. ❌ Servidor não está rodando → Reinicie: `taskkill /IM node.exe /F /T`
2. ❌ Conexão SSE caiu → Feche a aba e reabra
3. ❌ Usuário não é executor → Use conta que pode receber notificações

**Solução:**
- Abra Console (F12 → Console)
- Se vir erro de conexão, recarregue a página
- Verifique logs no terminal do servidor

### Badge não atualiza

**Verificar:**
1. Console mostra `📨 Nova notificação`?
2. Terminal mostra `📤 [SSE] ✉️  Notificação enviada`?
3. Função `atualizarBadgeNotif()` foi chamada?

**Se sim:** Recarregue a página (`F5`)
**Se não:** Verifique se usuário merece notificação

---

## O Que Mudou (vs. antes)

| Antes | Agora |
|-------|-------|
| ❌ Notificações via polling (30s em 30s) | ✅ **Notificações instantâneas** |
| ❌ Precisa recarregar para ver | ✅ **Atualiza sem refresh** |
| ❌ Todos recebem iguais | ✅ **Cada usuário recebe só suas** |
| ❌ Demora até 30s | ✅ **< 100ms de latência** |

---

## Estrutura de Diretórios (Arquivos SSE)

```
flowprod/
├── src/
│   ├── sse.js ← Gerenciador de conexões
│   ├── notificar.js ← Cria e envia notificações
│   └── routes/
│       └── notificacoes.js ← Endpoint SSE
├── public/
│   ├── tela2.html ← Tem conectarSSE()
│   ├── tela3-6.html ← Têm conectarSSE()
│   ├── admin.html ← Tem conectarSSE()
│   └── dashboard.html ← Tem conectarSSE()
└── server.js ← Rota GET /api/notificacoes/stream
```

---

## Como Funciona (Resumo Técnico)

```plaintext
1. Usuário acessa /tela2.html
   ↓
2. JavaScript chama: new EventSource('/api/notificacoes/stream')
   ↓
3. Servidor registra conexão em src/sse.js
   ↓
4. Admin aprova cliente
   ↓
5. notificar(usuario_id, 'cliente_aprovado', ...) é chamado
   ↓
6. Salva no BD + chama enviarNotificacao(usuario_id, notif)
   ↓
7. sse.js encontra conexão aberta e faz: res.write(`data: {...}\n\n`)
   ↓
8. Browser recebe evento 'message'
   ↓
9. JavaScript atualiza badge e lista de notificações
   ↓
10. ✅ Usuário vê notificação nova INSTANTANEAMENTE
```

---

**Teste agora! 🚀**
