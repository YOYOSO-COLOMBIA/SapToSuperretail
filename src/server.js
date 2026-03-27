const http = require('http');
const { runSync } = require('./services/sync.service');
const { closePool } = require('./config/sql');
const logger = require('./utils/logger');
const { app } = require('./config/env');

let currentRun = null;
let lastRun = null;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function extractToken(reqUrl, req) {
  const url = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
  return req.headers['x-run-token'] || url.searchParams.get('token') || '';
}

function isAuthorized(reqUrl, req) {
  if (!app.runToken) return true;
  return extractToken(reqUrl, req) === app.runToken;
}

function extractMode(reqUrl, req) {
  const url = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
  return url.searchParams.get('mode') || '';
}

async function executeSync(trigger, mode) {
  const startedAt = new Date().toISOString();
  logger.info('Iniciando sincronizacion por trigger HTTP', { trigger, mode, startedAt });

  try {
    const result = await runSync({ mode });
    lastRun = {
      ok: true,
      trigger,
      mode,
      startedAt,
      finishedAt: new Date().toISOString(),
      result
    };
    logger.info('Sincronizacion HTTP finalizada correctamente', lastRun);
    return lastRun;
  } catch (error) {
    lastRun = {
      ok: false,
      trigger,
      mode,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: error.message
    };
    logger.error('Sincronizacion HTTP fallo', lastRun);
    throw error;
  } finally {
    await closePool();
    currentRun = null;
  }
}

function startRun(trigger, mode) {
  if (currentRun) {
    return { started: false, running: true, promise: currentRun };
  }

  currentRun = executeSync(trigger, mode);
  currentRun.catch(() => {});
  return { started: true, running: false, promise: currentRun };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      running: Boolean(currentRun),
      lastRun
    });
    return;
  }

  if (url.pathname === '/run-sync') {
    if (!['POST', 'GET'].includes(req.method)) {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    if (!isAuthorized(req.url, req)) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }

    const mode = extractMode(req.url, req) || 'full';
    const runState = startRun('http', mode);

    if (runState.running) {
      sendJson(res, 409, {
        ok: false,
        error: 'Sync already running',
        lastRun
      });
      return;
    }

    sendJson(res, 202, {
      ok: true,
      message: 'Sync started',
      mode,
      lastRun
    });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/status') {
    sendJson(res, 200, {
      ok: true,
      service: 'sap-yoyoso-sync',
      running: Boolean(currentRun),
      endpoints: ['/health', '/run-sync?mode=full|items|stock|clients|validation'],
      lastRun
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(app.port, () => {
  logger.info('Servidor HTTP iniciado', {
    port: app.port,
    autoRunOnStart: app.autoRunOnStart,
    tokenProtected: Boolean(app.runToken)
  });

  if (app.autoRunOnStart) {
    startRun('startup', 'full');
  }
});

process.on('SIGTERM', async () => {
  await closePool();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  await closePool();
  server.close(() => process.exit(0));
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', error?.message || error);
});
