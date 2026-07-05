# FlowProd — Como Rodar o Projeto

## Estrutura de pastas

```
flowprod/
├── server.js                  ← servidor principal
├── package.json               ← dependências
├── .env                       ← configurações (banco, JWT)
├── database.sql               ← script para criar as tabelas
├── src/
│   ├── db.js                  ← conexão com PostgreSQL
│   ├── routes/
│   │   └── auth.js            ← rotas /api/login, /api/logout, /api/me
│   ├── controllers/
│   │   └── authController.js  ← lógica de login
│   └── middlewares/
│       └── auth.js            ← proteção de rotas com JWT
└── public/
    ├── login.html             ← tela 1 (pública)
    ├── tela2.html             ← tela 2 — Forecast (protegida)
    ├── tela3.html             ← tela 3 — PMP (protegida)
    └── ...                    ← demais telas
```

---

## Passo 1 — Instalar o que é necessário

1. Baixe e instale o **Node.js**: https://nodejs.org/pt-br  
2. Baixe e instale o **PostgreSQL**: https://www.postgresql.org/download  
3. Baixe o **DBeaver** (para ver o banco visualmente): https://dbeaver.io

---

## Passo 2 — Criar o banco de dados

Abra o **DBeaver** ou o **pgAdmin** e execute:

```sql
-- Primeiro crie o banco:
CREATE DATABASE flowprod;

-- Depois conecte ao banco "flowprod" e execute o arquivo database.sql
-- (cole o conteúdo do arquivo database.sql e execute)
```

Isso vai criar todas as tabelas e um usuário admin padrão:
- **E-mail:** admin@flowprod.com  
- **Senha:** Admin@123

---

## Passo 3 — Configurar o arquivo .env

Abra o arquivo `.env` e preencha com os dados do seu PostgreSQL:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flowprod
DB_USER=postgres
DB_PASSWORD=SUA_SENHA_DO_POSTGRES_AQUI

PORT=3000
JWT_SECRET=cole_aqui_uma_chave_aleatoria_bem_longa
```

Para gerar o JWT_SECRET, abra o terminal e rode:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Passo 4 — Instalar as dependências do projeto

Abra o terminal na pasta do projeto e rode:

```bash
npm install
```

Isso vai instalar: express, pg, bcrypt, jsonwebtoken, dotenv, cors, cookie-parser.

---

## Passo 5 — Iniciar o servidor

```bash
node server.js
```

Ou, se instalou nodemon (recarrega automático ao salvar):
```bash
npm run dev
```

Você verá no terminal:
```
✅ Conectado ao PostgreSQL com sucesso!
🚀 FlowProd rodando em http://localhost:3000
```

---

## Passo 6 — Acessar o sistema

Abra o navegador e acesse:  
👉 **http://localhost:3000**

Use o login padrão:
- E-mail: `admin@flowprod.com`
- Senha: `Admin@123`

---

## Como cadastrar novos usuários (executores)

Por enquanto, insira direto no banco via DBeaver ou pgAdmin.  
Primeiro gere o hash da senha no terminal:

```bash
node -e "const b=require('bcrypt'); b.hash('SenhaAqui',10).then(h=>console.log(h))"
```

Depois insira no banco:

```sql
INSERT INTO usuarios (nome, email, senha_hash, funcao)
VALUES (
  'Nome do Executor',
  'executor@empresa.com',
  'COLE_O_HASH_GERADO_AQUI',
  'FORECAST'   -- ou PMP, MRP, ESTOQUE, CRP, DASHBOARD
);
```

### Funções disponíveis:
| Função    | Tela de destino após login |
|-----------|---------------------------|
| ADMIN     | /admin.html               |
| FORECAST  | /tela2.html               |
| PMP       | /tela3.html               |
| MRP       | /tela4.html               |
| ESTOQUE   | /tela5.html               |
| CRP       | /tela6.html               |
| DASHBOARD | /tela6.html               |

---

## Como o login funciona (resumo técnico)

```
Navegador                    Servidor Node.js              PostgreSQL
    |                              |                            |
    |-- POST /api/login ---------->|                            |
    |   { email, senha }           |-- SELECT * FROM usuarios ->|
    |                              |<-- usuário encontrado -----|
    |                              |-- bcrypt.compare() --------|
    |                              |   (verifica senha)         |
    |<-- { redirecionar: /tela2 } -|                            |
    |   + cookie com token JWT     |                            |
    |                              |                            |
    |-- GET /tela2.html ---------->|                            |
    |   (envia cookie JWT)         |-- verifica token JWT ------|
    |<-- tela2.html ---------------|                            |
```
