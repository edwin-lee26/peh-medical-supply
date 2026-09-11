/* Minimal static file server for PEH Medical Supply (no dependencies).
   Usage: node server.js  [port]   (default 8123)
   Serves files from the project folder and falls back to index.html. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Render / cloud hosts inject PORT via the environment (default local 8123)
const PORT = parseInt(process.env.PORT, 10) || parseInt(process.argv[2], 10) || 8123;
const ROOT = __dirname;

// Primary LAN IP so phones / tablets on the same Wi-Fi can open the
// site (Safari on iPhone cannot reach "localhost" — that points to the
// phone itself).
function getLanIp() {
    try {
        const ifaces = os.networkInterfaces();
        const candidates = [];
        Object.keys(ifaces).forEach(function (name) {
            (ifaces[name] || []).forEach(function (addr) {
                if (addr.family === 'IPv4' && !addr.internal) {
                    candidates.push(addr.address);
                }
            });
        });
        return candidates[0] || 'localhost';
    } catch (e) {
        return 'localhost';
    }
}
const LAN_IP = getLanIp();

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

/* ------------------------------------------------------------------
   SHARED ORDER INBOX (demo backend)
   Orders POSTed from any device that opens the "share link" are
   appended here (persisted to data/orders.json). The admin page
   refreshes this file so customers' orders appear in the portal.

   FUTURE BACKEND NOTE: Replace with Supabase / Firebase so orders
   persist across a real database instead of this JSON file.
------------------------------------------------------------------ */
const DATA_DIR = path.join(ROOT, 'data');
const INBOX_FILE = path.join(DATA_DIR, 'orders.json');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');

function readInbox() {
    try {
        const raw = fs.readFileSync(INBOX_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function writeInbox(orders) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(INBOX_FILE, JSON.stringify(orders, null, 2), 'utf8');
    } catch (e) {
        /* demo: ignore write errors */
    }
}

function handleOrderInbox(req, res) {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath !== '/api/orders') return null;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    if (req.method === 'DELETE') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            let payload = null;
            try { payload = JSON.parse(body); } catch (e) { /* fall through */ }
            const inbox = readInbox();
            if (payload && payload.clear) {
                writeInbox([]);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, count: 0, cleared: true }));
            } else if (payload && payload.orderId) {
                const filtered = inbox.filter((o) => o.orderId !== payload.orderId);
                writeInbox(filtered);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true, count: filtered.length, deleted: payload.orderId }));
            } else {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Provide orderId or { clear: true }' }));
            }
        });
        return true;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            let order = null;
            try { order = JSON.parse(body); } catch (e) { /* fall through */ }
            if (!order || !order.orderId) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid order' }));
                return;
            }
            const inbox = readInbox();
            const existing = inbox.find((o) => o.orderId === order.orderId);
            if (!existing) {
                inbox.push(order);
                writeInbox(inbox);
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true, count: readInbox().length }));
        });
        return true;
    }

    if (req.method === 'GET') {
        const inbox = readInbox();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(inbox));
        return true;
    }

    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
}

/* ------------------------------------------------------------------
   SHARED PRODUCT CATALOG (demo backend)
   Admin product/category edits are POSTed here and persisted to
   data/catalog.json. Every device that opens the site GETs this file,
   so a single admin save is visible to everyone (all origins).
------------------------------------------------------------------ */
function handleCatalogApi(req, res) {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath !== '/api/catalog') return null;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    if (req.method === 'GET') {
        let catalog = {};
        try {
            if (fs.existsSync(CATALOG_FILE)) {
                catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
            }
        } catch (e) { /* missing/corrupt -> defaults on the client */ }
        if (!catalog || typeof catalog !== 'object') catalog = {};
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
            ok: true,
            departments: Array.isArray(catalog.departments) ? catalog.departments : null,
            products: Array.isArray(catalog.products) ? catalog.products : null,
            categories: Array.isArray(catalog.categories) ? catalog.categories : null
        }));
        return true;
    }

    if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
            let data = null;
            try { data = JSON.parse(body); } catch (e) { /* fall through */ }
            if (!data || !Array.isArray(data.products)) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid catalog' }));
                return;
            }
            const products = data.products
                .filter((p) => p && typeof p.code === 'string' && p.code !== '')
                .slice(0, 1000);
            const categories = Array.isArray(data.categories)
                ? data.categories.filter((c) => c && typeof c.id === 'string').slice(0, 500)
                : null;
            const departments = Array.isArray(data.departments) && data.departments.length
                ? data.departments.slice(0, 20)
                : null;
            try {
                if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
                const stored = { products: products, categories: categories };
                if (departments) stored.departments = departments;
                fs.writeFileSync(CATALOG_FILE, JSON.stringify(stored, null, 2), 'utf8');
            } catch (e) { /* demo: ignore write errors */ }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true }));
        });
        return true;
    }

    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
}

function handleApiMeta(req, res) {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath !== '/api/meta') return null;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }

    if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
            shareUrl: getShareUrl()
        }));
        return true;
    }

    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
}

// Public (internet) URL, if a Cloudflare quick tunnel is running.
// Priority: data/public-url.txt  >  data/cloudflared.log  >  LAN IP.
function getShareUrl() {
    const candidates = [
        path.join(DATA_DIR, 'public-url.txt'),
        path.join(DATA_DIR, 'cloudflared.log')
    ];
    for (let i = 0; i < candidates.length; i++) {
        try {
            if (!fs.existsSync(candidates[i])) continue;
            const text = fs.readFileSync(candidates[i], 'utf8');
            const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (m) return m[0].replace(/\/+$/, '');
        } catch (e) { /* next */ }
    }
    return 'http://' + LAN_IP + ':' + PORT;
}

const server = http.createServer((req, res) => {
    if (handleApiMeta(req, res)) return;
    if (handleCatalogApi(req, res)) return;
    if (req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE' || req.method === 'OPTIONS') {
        if (handleOrderInbox(req, res)) return;
    }

    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.normalize(path.join(ROOT, urlPath));

    // Prevent path traversal outside the project folder
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            // SPA-ish fallback: unknown route -> index.html
            fs.readFile(path.join(ROOT, 'index.html'), (err2, html) => {
                if (err2) {
                    res.writeHead(404);
                    res.end('Not found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': MIME['.html'] });
                res.end(html);
            });
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const cacheable = ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot'].indexOf(ext) !== -1;
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            // Static assets are cached by the browser for 5 minutes so page
            // loads stay fast (esp. through the cloudflare tunnel). HTML is
            // never cached so edits show up immediately.
            'Cache-Control': cacheable ? 'public, max-age=300' : 'no-cache'
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║  PEH Medical Supply                              ║');
    console.log('  ╠══════════════════════════════════════════════════╣');
    console.log('  ║  Local:  http://localhost:' + PORT + '/'.padEnd(30) + '║');
    console.log('  ║  LAN:    http://' + LAN_IP + ':' + PORT + '/'.padEnd(30) + '║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
});
