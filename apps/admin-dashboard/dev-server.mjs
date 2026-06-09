/**
 * Dev server Engage Solar — UI + proxy API → gateway ReservaAI :8080
 * Uso: npm run dev   (não use npx serve)
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const GATEWAY = String(process.env.RESERVAAI_GATEWAY_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

const PROXY_PREFIXES = ['/api/', '/engage/', '/oauth2/', '/login/oauth2/'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function shouldProxy(urlPath) {
  return PROXY_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

function isDevUiOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1):5173$/i.test(String(origin || '').trim());
}

function corsOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (isDevUiOrigin(origin)) {
    return origin;
  }
  return `http://localhost:${PORT}`;
}

function applyCorsHeaders(res, req, extra = {}) {
  const allowOrigin = corsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  Object.entries(extra).forEach(([key, value]) => {
    if (value != null) res.setHeader(key, value);
  });
}

function resolveStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(__dirname, safe === '/' || safe === '\\' ? 'index.html' : safe);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }
  return filePath;
}

function buildProxyHeaders(req, gatewayUrl) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  headers.host = gatewayUrl.host;
  if (gatewayUrl.port && gatewayUrl.port !== '80' && gatewayUrl.port !== '443') {
    headers.host = `${gatewayUrl.hostname}:${gatewayUrl.port}`;
  }
  return headers;
}

function proxyRequest(req, res, targetUrl) {
  const gatewayUrl = new URL(targetUrl);
  const lib = gatewayUrl.protocol === 'https:' ? https : http;
  const headers = buildProxyHeaders(req, gatewayUrl);

  const proxyReq = lib.request(
    {
      protocol: gatewayUrl.protocol,
      hostname: gatewayUrl.hostname,
      port: gatewayUrl.port || (gatewayUrl.protocol === 'https:' ? 443 : 80),
      path: `${gatewayUrl.pathname}${gatewayUrl.search}`,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const outHeaders = { ...proxyRes.headers };
      delete outHeaders['access-control-allow-origin'];
      delete outHeaders['access-control-allow-credentials'];
      outHeaders['x-engage-dev-proxy'] = '1';
      outHeaders['access-control-allow-origin'] = corsOrigin(req);
      outHeaders['access-control-allow-credentials'] = 'true';
      outHeaders.vary = 'Origin';
      res.writeHead(proxyRes.statusCode || 502, outHeaders);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    console.error('[proxy erro]', req.method, targetUrl, err.message);
    if (!res.headersSent) {
      applyCorsHeaders(res, req, { 'Content-Type': 'application/json; charset=utf-8' });
      res.writeHead(502);
    }
    res.end(
      JSON.stringify({
        message: `Gateway indisponível em ${GATEWAY}. Suba o ReservaAI (docker) na porta 8080.`,
        detail: err.message,
      }),
    );
  });

  req.pipe(proxyReq);
}

function serveStatic(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Engage-Dev-Server': '1',
  });
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end('Erro ao ler arquivo');
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/__engage/dev-health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, proxy: GATEWAY, port: PORT }));
    return;
  }

  if (req.method === 'OPTIONS' && shouldProxy(url.pathname)) {
    applyCorsHeaders(res, req, {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers']
        || 'Authorization, Accept, Content-Type, X-Requested-With',
      'Access-Control-Max-Age': '3600',
      'Content-Length': '0',
    });
    res.writeHead(204);
    res.end();
    return;
  }

  if (shouldProxy(url.pathname)) {
    const target = `${GATEWAY}${url.pathname}${url.search}`;
    proxyRequest(req, res, target);
    return;
  }

  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  serveStatic(req, res, filePath);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Engage Solar — dev server (com proxy de API)');
  console.log(`  UI:    http://localhost:${PORT}/login.html`);
  console.log(`  API:   http://localhost:${PORT}/api/...  →  ${GATEWAY}`);
  console.log('  Não use "npx serve" nesta porta.');
  console.log('');
});
