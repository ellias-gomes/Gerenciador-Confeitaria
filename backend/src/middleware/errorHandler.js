function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Rota da API não encontrada.' });
  }
  next();
}

function errorHandler(err, req, res, _next) {
  if (err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(409).json({
      error: 'Não é possível excluir este item porque ele está vinculado a outros registros (receitas ou pedidos).',
    });
  }
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({
      error: 'Já existe um registro com esse identificador único.',
    });
  }

  const status = err.status || 500;
  const message = status >= 500 ? 'Erro interno no servidor.' : err.message;
  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error('[API Error]', err);
  }
  res.status(status).json({ error: message });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
