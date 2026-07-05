# 🚀 FlowProd — Guia de Deploy (Render + Neon)

## Stack gratuita
| Serviço | Uso | URL |
|---------|-----|-----|
| **Render** | Hospeda o Node.js | render.com |
| **Neon** | PostgreSQL na nuvem | neon.tech |

---

## Passo 1 — Banco no Neon

1. Acesse **neon.tech** → crie conta (sem cartão)
2. Clique em **"New Project"** → nome: `flowprod`
3. Aguarde criar → vá em **"Connection Details"**
4. Copie a **Connection string** (começa com `postgresql://...`)
5. No DBeaver, conecte usando essa string e rode o `flowprod_banco.sql`

---

## Passo 2 — Suba o código no GitHub

```bash
git init
git add .
git commit -m "chore: deploy inicial FlowProd"
git remote add origin https://github.com/SEU_USUARIO/flowprod.git
git push -u origin main
```

> ⚠️ O `.env` está no `.gitignore` — nunca vai para o GitHub. As credenciais ficam só no painel do Render.

---

## Passo 3 — Deploy no Render

1. Acesse **render.com** → crie conta com GitHub
2. Clique **"New +"** → **"Web Service"**
3. Selecione o repositório `flowprod`
4. Configure:
   - **Name:** `flowprod`
   - **Region:** `Oregon (US West)` ou mais próxima
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`

5. Em **"Environment Variables"**, adicione:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | Connection string do Neon |
| `JWT_SECRET` | Gere com: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `APP_URL` | `https://flowprod.onrender.com` (URL que o Render vai te dar) |
| `EMAIL_HOST` | `smtp.gmail.com` |
| `EMAIL_PORT` | `587` |
| `EMAIL_SECURE` | `false` |
| `EMAIL_USER` | seu Gmail |
| `EMAIL_PASS` | Senha de app do Gmail (16 chars) |
| `EMAIL_ADMIN` | Gmail que recebe notificações |
| `MANUTENCAO_SENHA` | Senha forte para o painel de manutenção |

6. Clique **"Create Web Service"** → aguarde o deploy (~3 min)
7. Sua URL será: `https://flowprod.onrender.com`

---

## Passo 4 — Testar

- `https://flowprod.onrender.com` → Landing page
- `https://flowprod.onrender.com/api/health` → Deve retornar `{"ok":true}`
- `https://flowprod.onrender.com/login.html` → Login
- `https://flowprod.onrender.com/admin.html` → Admin

---

## Painel de manutenção

URL: `https://flowprod.onrender.com/painel-manutencao`

- Acesse com a `MANUTENCAO_SENHA` configurada no Render
- Ative para bloquear todos os usuários → tela de manutenção
- Desative para voltar ao ar

> 💡 **Dica:** Salve esse link nos favoritos. Quando quiser "derrubar" o sistema, acesse, coloque a senha e ative. Para voltar, desative.

---

## ⚠️ Limitações do plano gratuito

- O servidor **dorme após 15 min** sem acesso e leva ~1 min para acordar
- Para apresentação do TCC: acesse o link 2 minutos antes para ele acordar
- O banco Neon tem **0.5 GB** de storage — mais que suficiente para o TCC

---

## Atualizar após mudanças

```bash
git add .
git commit -m "feat: descrição da mudança"
git push
```
O Render faz redeploy automático a cada `git push` 🚀
