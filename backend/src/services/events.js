/**
 * Hub de eventos em tempo real (SSE) para manter Web e Android sincronizados.
 */

const clients = new Set();

function subscribe(res, user) {
  const client = {
    res,
    userId: user?.id || null,
    teamId: user?.team_id || 1,
    connectedAt: Date.now(),
  };
  clients.add(client);

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, timestamp: new Date().toISOString() })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch (_) {
      clearInterval(keepAlive);
      clients.delete(client);
    }
  }, 25000);

  res.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(client);
  });
}

function broadcast(resource, action, data = {}, teamId = null) {
  const payload = JSON.stringify({
    resource,
    action,
    data,
    timestamp: new Date().toISOString(),
  });

  for (const client of clients) {
    if (teamId !== null && client.teamId !== teamId) {
      continue;
    }
    try {
      client.res.write(`event: sync\ndata: ${payload}\n\n`);
    } catch (_) {
      clients.delete(client);
    }
  }
}

function getConnectedCount(teamId = null) {
  if (teamId === null) return clients.size;
  let count = 0;
  for (const client of clients) {
    if (client.teamId === teamId) count += 1;
  }
  return count;
}

module.exports = {
  subscribe,
  broadcast,
  getConnectedCount,
};
