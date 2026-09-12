/* Minimal static file server for PEH Medical Supply (no dependencies).
   Usage: node server.js  [port]   (default 8123)
   Serves files from the project folder and falls back to index.html. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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

/* ------------------------------------------------------------------
   ADMIN ACCESS GATE
   /admin.html is only served to a browser that logged in here first.
   Login issues an HttpOnly session cookie; the password check is the
   same demo credentials the app itself uses (admin / admin123).
   The public site (everything else) is never blocked.
------------------------------------------------------------------ */
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123'; // demo credentials — change in both places
const ADMIN_COOKIE = 'pehms_admin';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const ADMIN_TOKENS = new Map(); // token -> expiry ms

function makeToken() {
    return crypto.randomBytes(24).toString('hex');
}

function readCookie(req, name) {
    const header = req.headers.cookie || '';
    const m = new RegExp('(?:^|;\\s*)' + encodeURIComponent(name) + '=([^;]+)').exec(header);
    return m ? decodeURIComponent(m[1]) : '';
}

function hasAdminSession(req) {
    const token = readCookie(req, ADMIN_COOKIE);
    if (!token) return false;
    const exp = ADMIN_TOKENS.get(token);
    if (!exp) return false;
    if (Date.now() > exp) {
        ADMIN_TOKENS.delete(token);
        return false;
    }
    return true;
}

function pruneTokens() {
    const now = Date.now();
    ADMIN_TOKENS.forEach((exp, token) => { if (now > exp) ADMIN_TOKENS.delete(token); });
}

function handleAuthApi(req, res) {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const isLogin = urlPath === '/api/login';
    const isLogout = urlPath === '/api/logout';
    if (!isLogin && !isLogout) return null;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return true;
    }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
        let payload = null;
        try { payload = JSON.parse(body); } catch (e) { /* fall through */ }

        if (isLogout) {
            const token = readCookie(req, ADMIN_COOKIE);
            if (token) ADMIN_TOKENS.delete(token);
            res.setHeader('Set-Cookie', ADMIN_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ ok: true }));
            return;
        }

        if (!payload || payload.user !== ADMIN_USER || payload.password !== ADMIN_PASS) {
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
            return;
        }

        pruneTokens();
        const token = makeToken();
        ADMIN_TOKENS.set(token, Date.now() + SESSION_TTL);
        res.setHeader('Set-Cookie',
            ADMIN_COOKIE + '=' + encodeURIComponent(token) +
            '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_TTL / 1000));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true }));
    });
    return true;
}

// Minimal branded login page for the admin gate. Posts the password to
// /api/login; on success the server redirects back to admin.html.
function serveAdminGate(res) {
    const html =
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<title>Admin Login — PEH Medical Supply</title>' +
        '<style>' +
        'body{font-family:Segoe UI,system-ui,-apple-system,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}' +
        '.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 8px 24px rgba(15,27,45,.08);width:100%;max-width:360px;padding:28px;text-align:center;}' +
        '.logo{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#0d6efd,#0891b2);color:#fff;font-size:24px;margin-bottom:14px;}' +
        'h1{font-size:20px;margin:0 0 4px;color:#16233b;}' +
        'p{color:#5b6b83;font-size:14px;margin:0 0 20px;}' +
        'label{display:block;text-align:left;font-size:13px;color:#43536b;margin:0 0 6px;font-weight:600;}' +
        'input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;margin-bottom:16px;}' +
        'button{width:100%;padding:12px;border:0;border-radius:10px;background:#0d6efd;color:#fff;font-size:15px;font-weight:600;cursor:pointer;}' +
        '.err{color:#dc2626;font-size:13.5px;margin-top:12px;min-height:18px;}' +
        '</style></head><body>' +
        '<form class="card" id="login" onsubmit="return doLogin(event)">' +
        '<span class="logo"><i class="fa-solid fa-shield-halved"></i></span>'.replace('<i class="fa-solid fa-shield-halved"></i>', '&#x1f6e1;') +
        '<h1>Admin Login</h1><p>Restricted area — administrator access only.</p>' +
        '<label for="u">Username</label><input id="u" value="admin" autocomplete="username">' +
        '<label for="p">Password</label><input id="p" type="password" autocomplete="current-password" placeholder="••••••••">' +
        '<button type="submit">Sign In</button>' +
        '<div class="err" id="err"></div>' +
        '</form>' +
        '<script>' +
        'function doLogin(e){e.preventDefault();var u=document.getElementById("u").value.trim();' +
        'var p=document.getElementById("p").value;var err=document.getElementById("err");' +
        'fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},' +
        'body:JSON.stringify({user:u,password:p}),credentials:"same-origin"}).then(function(r){' +
        'if(r.ok){window.location.href="/admin.html";}else{err.textContent="Invalid username or password.";}' +
        '}).catch(function(){err.textContent="Server error — try again.";});return false;}' +
        '</script></body></html>';
    res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
}

const server = http.createServer((req, res) => {
    if (handleApiMeta(req, res)) return;
    if (handleAuthApi(req, res)) return;
    if (handleCatalogApi(req, res)) return;
    if (req.method === 'GET' || req.method === 'POST' || req.method === 'DELETE' || req.method === 'OPTIONS') {
        if (handleOrderInbox(req, res)) return;
    }

    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.normalize(path.join(ROOT, urlPath));

    // Admin gate: block /admin.html until the visitor logs in.
    const isAdminPage = urlPath === '/admin.html' || urlPath === '/admin/';
    if (isAdminPage && req.method === 'GET' && !hasAdminSession(req)) {
        serveAdminGate(res);
        return;
    }

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
        let out = data;
        if (isAdminPage && hasAdminSession(req)) {
            // Tell the client the password was already accepted by the server,
            // so it can skip the in-app login form and go straight to the dashboard.
            out = Buffer.from(
                data.toString('utf8').replace(
                    '</head>',
                    '<script>window.__SERVER_AUTH__=true;</script></head>'
                )
            );
        }
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            // Static assets are cached by the browser for 5 minutes so page
            // loads stay fast (esp. through the cloudflare tunnel). HTML is
            // never cached so edits show up immediately.
            'Cache-Control': cacheable ? 'public, max-age=300' : 'no-cache'
        });
        res.end(out);
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
