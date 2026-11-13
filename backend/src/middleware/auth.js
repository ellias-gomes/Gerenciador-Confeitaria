const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ROLES = ['admin', 'confeiteira', 'atendente', 'visualizador'];

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return null;
}

function authenticate(db) {
  return (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Autenticação necessária. Faça login para continuar.' });
    }

    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      const user = db.prepare(
        'SELECT id, name, email, role, phone, active, created_at FROM users WHERE id = ?'
      ).get(payload.sub);

      if (!user || !user.active) {
        return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
      }

      req.user = user;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' });
    }
  };
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acesso negado para o perfil "${req.user.role}". Permissão necessária: ${allowedRoles.join(', ')}.`,
      });
    }
    next();
  };
}

module.exports = {
  ROLES,
  authenticate,
  authorize,
};
