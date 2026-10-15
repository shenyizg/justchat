#!/usr/bin/env node
// Serve JustChat and relay its API requests, for providers that don't allow browser (CORS) requests.
//
//   node serve.mjs                                    # http://localhost:8686, this computer only
//   node serve.mjs --host 0.0.0.0 --allow https://api.example.com
//
// Open the printed address, then turn on "Send requests through this page's server" for the providers
// that need it. Node.js 20+, no dependencies. Requests (API keys included) are relayed as they are and
// replies are streamed back; nothing is stored, and the log has one line per request.

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const INDEX = fileURLToPath(new URL('./index.html', import.meta.url));
const MAX_BODY = 64 * 1024 * 1024;
// Hop-by-hop and browser-specific headers are not forwarded.
const SKIP_REQUEST = new Set(['host', 'connection', 'keep-alive', 'proxy-authorization', 'proxy-connection', 'te', 'trailer',
  'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding', 'origin', 'referer', 'cookie']);
const SKIP_RESPONSE = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'transfer-encoding', 'trailer', 'upgrade', 'set-cookie']);

const { values: args } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '8686' },
    allow: { type: 'string', multiple: true, default: [] },
    cert: { type: 'string' },
    key: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (args.help) {
  console.log(`Usage: node serve.mjs [--host 127.0.0.1] [--port 8686] [--allow URL ...] [--cert FILE --key FILE]

  --host    address to listen on (default 127.0.0.1: this computer only)
  --port    port (default 8686)
  --allow   API address the relay may forward to, e.g. https://api.example.com (repeatable).
            Required when listening on anything but this computer.
  --cert    TLS certificate (PEM) and --key private key, to serve over HTTPS`);
  process.exit(0);
}

const allow = args.allow.flatMap(a => a.split(',')).map(a => a.trim()).filter(Boolean).map(a => {
  let u;
  try { u = new URL(a); } catch { u = null; }
  if (!u || !/^https?:$/.test(u.protocol)) fail(`--allow needs a full URL such as https://api.example.com, got: ${a}`);
  return u;
});
const isLoopback = host => host === 'localhost' || (net.isIP(host) && (host.startsWith('127.') || host === '::1'));
if (!allow.length && !isLoopback(args.host)) {
  fail(`Not starting an open relay on ${args.host}. Add --allow with the API addresses it may forward to, for example: --allow https://api.example.com`);
}
if (!existsSync(INDEX)) fail(`index.html not found next to serve.mjs (${INDEX})`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function allowed(target) {
  if (!allow.length) return true;
  const path = target.pathname.replace(/\/+$/, '') + '/';
  return allow.some(a => a.protocol === target.protocol && a.host === target.host && path.startsWith(a.pathname.replace(/\/+$/, '') + '/'));
}

function sendJSON(res, status, message) {
  const body = JSON.stringify({ error: { message } });
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendIndex(res) {
  // Tells the page that this server can relay requests, which enables the provider option.
  const html = readFileSync(INDEX, 'utf8').replace('</head>', '<meta name="justchat-proxy" content="proxy">\n</head>');
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(html), 'Cache-Control': 'no-cache' });
  res.end(html);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function relay(req, res, query) {
  // Only this page may use the relay; other websites open in the browser may not.
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return sendJSON(res, 403, 'Cross-site requests are not relayed');
  let target;
  try { target = new URL(new URLSearchParams(query).get('url') || ''); } catch { target = null; }
  if (!target || !/^https?:$/.test(target.protocol)) return sendJSON(res, 400, 'Missing or invalid url parameter');
  res.target = target.origin;
  if (!allowed(target)) return sendJSON(res, 403, `${target.origin} is not in the allow list of serve.mjs (--allow)`);
  const body = await readBody(req);
  if (!body) return sendJSON(res, 413, 'Request too large');

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!SKIP_REQUEST.has(k) && !k.startsWith('sec-')) headers[k] = v;
  if (body.length) headers['content-length'] = body.length;
  const upstream = (target.protocol === 'https:' ? https : http).request(target, { method: req.method, headers, timeout: 600_000 }, up => {
    const out = {};
    for (const [k, v] of Object.entries(up.headers)) if (!SKIP_RESPONSE.has(k)) out[k] = v;
    res.writeHead(up.statusCode, out);
    res.flushHeaders();
    up.pipe(res); // streamed as it arrives
  });
  upstream.on('timeout', () => upstream.destroy(new Error('no response for 10 minutes')));
  upstream.on('error', err => {
    if (!res.headersSent) sendJSON(res, 502, `serve.mjs could not reach ${target.origin}: ${err.code || err.message}`);
    else res.destroy();
  });
  // The browser stopped reading (stop button): dropping the upstream connection ends the generation too.
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  upstream.end(body);
}

function handle(req, res) {
  const [path, query = ''] = req.url.split(/\?(.*)/s);
  res.on('close', () => console.log(`${new Date().toISOString()}  ${req.method} ${path} ${res.target || ''} -> ${res.statusCode}${res.writableFinished ? '' : ' (closed early)'}`));
  if (req.method === 'GET' && (path === '/' || path === '/index.html')) return sendIndex(res);
  if (path === '/proxy' && (req.method === 'GET' || req.method === 'POST')) {
    return relay(req, res, query).catch(err => { if (!res.headersSent) sendJSON(res, 500, String(err.message || err)); });
  }
  sendJSON(res, 404, 'Not found');
}

const server = args.cert
  ? https.createServer({ cert: readFileSync(args.cert), key: readFileSync(args.key) }, handle)
  : http.createServer(handle);
server.requestTimeout = 0; // long uploads and generations are fine
server.on('error', err => fail(`Cannot listen on ${args.host}:${args.port} (${err.code || err.message}). Pick another port with --port.`));
server.listen(Number(args.port), args.host, () => {
  const host = isLoopback(args.host) ? 'localhost' : args.host.includes(':') ? `[${args.host}]` : args.host;
  console.log(`JustChat: ${args.cert ? 'https' : 'http'}://${host}:${args.port}/`);
  console.log(`Relay allows: ${allow.length ? allow.map(a => a.href.replace(/\/$/, '')).join(', ') : 'any API (reachable from this computer only)'}`);
});
