// src/db.js — Conexão com PostgreSQL (local ou Neon via DATABASE_URL)
const { Pool } = require('pg');
require('dotenv').config();

const isProducao = !!process.env.DATABASE_URL;

const pool = new Pool(
  isProducao
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // obrigatório no Neon/Render
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'flowprod',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
      }
);

pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
  } else {
    const modo = isProducao ? '☁️  Neon (produção)' : '🏠 Local (desenvolvimento)';
    console.log(`✅ PostgreSQL conectado — ${modo}`);
    release();
  }
});

module.exports = pool;
