// src/middlewares/rateLimiter.js
// Rate limiting simples em memória — sem dependências externas
// Bloqueia um IP após N tentativas falhas em X minutos

const tentativas = new Map(); // ip -> { count, bloqueadoAte }

const MAX_TENTATIVAS  = 5;          // máximo de erros antes de bloquear
const JANELA_MS       = 15 * 60 * 1000; // janela de 15 minutos
const BLOQUEIO_MS     = 15 * 60 * 1000; // tempo de bloqueio: 15 minutos

// Limpa entradas antigas a cada 10 minutos para não vazar memória
setInterval(() => {
  const agora = Date.now();
  for (const [ip, dado] of tentativas.entries()) {
    if (dado.bloqueadoAte && dado.bloqueadoAte < agora) tentativas.delete(ip);
    else if (!dado.bloqueadoAte && dado.primeiraEm && (agora - dado.primeiraEm) > JANELA_MS) tentativas.delete(ip);
  }
}, 10 * 60 * 1000);

function obterIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'desconhecido'
  );
}

// ── Middleware: bloqueia se IP estiver no limite ──────────
function verificarRateLimit(req, res, next) {
  const ip    = obterIP(req);
  const agora = Date.now();
  const dado  = tentativas.get(ip);

  if (dado?.bloqueadoAte && dado.bloqueadoAte > agora) {
    const restam = Math.ceil((dado.bloqueadoAte - agora) / 60000);
    return res.status(429).json({
      erro: `Muitas tentativas. Tente novamente em ${restam} minuto(s).`,
      bloqueado: true,
      restamMinutos: restam,
    });
  }

  next();
}

// ── Registrar tentativa falha ─────────────────────────────
function registrarFalha(ip) {
  const agora = Date.now();
  const dado  = tentativas.get(ip) || { count: 0, primeiraEm: agora };

  // Resetar janela se já passou o tempo
  if ((agora - dado.primeiraEm) > JANELA_MS) {
    dado.count    = 0;
    dado.primeiraEm = agora;
    dado.bloqueadoAte = null;
  }

  dado.count++;

  if (dado.count >= MAX_TENTATIVAS) {
    dado.bloqueadoAte = agora + BLOQUEIO_MS;
    console.warn(`[rate-limit] IP ${ip} bloqueado após ${dado.count} tentativas.`);
  }

  tentativas.set(ip, dado);
  return dado.count;
}

// ── Limpar tentativas após login bem-sucedido ─────────────
function registrarSucesso(ip) {
  tentativas.delete(ip);
}

module.exports = { verificarRateLimit, registrarFalha, registrarSucesso, obterIP };
