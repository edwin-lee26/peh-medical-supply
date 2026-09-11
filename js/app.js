/**
 * ============================================================
 *  PEH Medical Supply — js/app.js
 * ------------------------------------------------------------
 *  Shared layer used by every page:
 *    - Storage layer (LocalStorage <-> future backend)
 *    - Cart / Order / Product helper functions
 *    - Global header injection + cart count
 *    - Shared UI helpers (toast, modal dialog, empty states,
 *      formatting, escape)
 *
 *  FUTURE BACKEND NOTE:
 *  To connect a database (Firebase / Supabase / MySQL) later,
 *  replace the internals of the storage functions below
 *  (getCart, saveCart, getOrders, saveOrder, getProducts,
 *  saveProducts ...) with async calls to your backend.
 *  Every page goes through these helpers, so nothing else
 *  in the app needs to change.
 * ============================================================
 */

(function () {
    'use strict';

    /* ------------------------------------------------------------------
       STORAGE KEYS
    ------------------------------------------------------------------ */
    var KEYS = {
        cart: 'medicalSupplyCart',
        orders: 'medicalSupplyOrders',
        products: 'medicalSupplyProducts',    // admin-added / edited / deleted products
        categories: 'medicalSupplyCategories',// admin-added / edited / deleted categories
        syncApi: 'medicalSupplySyncApi',      // optional order sync endpoint ('' = off, or a URL)
        adminSession: 'medicalSupplyAdminSession'
    };

    /* ------------------------------------------------------------------
       LOW-LEVEL STORAGE HELPERS (LocalStorage)
    ------------------------------------------------------------------ */
    function storageAvailable() {
        try {
            var t = '__msm_test__';
            window.localStorage.setItem(t, '1');
            window.localStorage.removeItem(t);
            return true;
        } catch (e) {
            return false;
        }
    }

    var HAS_LOCAL_STORAGE = storageAvailable();

    function readStore(key, fallback) {
        if (!HAS_LOCAL_STORAGE) return fallback;
        try {
            var raw = window.localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) {
            // Invalid JSON in storage — start fresh.
            return fallback;
        }
    }

    // FUTURE: Replace with write to Supabase / Firebase.
    function writeStore(key, value) {
        if (!HAS_LOCAL_STORAGE) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* storage full / blocked — ignore for demo */ }
    }

    /* ------------------------------------------------------------------
       PRODUCTS
       Defaults come from js/data.js. LocalStorage keeps only the
       differences (added / edited / deleted), so future updates to
       data.js still reach clients that have used admin tools.

       When the shared server is reachable, the PRODUCT CATALOG is
       fetched from /api/catalog (server-side copy of admin edits), so a
       save made on the admin page is visible on every device/origin.
    ------------------------------------------------------------------ */

    var serverCatalog = null;   // { products:[], categories:[] } once loaded
    var catalogFetched = false; // avoids duplicate in-flight fetches

    function catalogApiUrl() {
        var u = getSyncApiUrl(); // .../api/orders
        if (!u) return '';
        return u.replace(/\/api\/orders$/, '/api/catalog');
    }

    // Pull the shared catalog (if any) and tell pages to re-render.
    function fetchCatalogRemote() {
        var url = catalogApiUrl();
        if (!url || catalogFetched) {
            return Promise.resolve(!!serverCatalog);
        }
        catalogFetched = true;
        return fetch(url, { method: 'GET' })
            .then(function (r) { if (!r.ok) throw new Error('catalog http ' + r.status); return r.json(); })
            .then(function (data) {
                if (data && data.ok && Array.isArray(data.products)) {
                    serverCatalog = {
                        departments: Array.isArray(data.departments) ? data.departments : null,
                        products: data.products,
                        categories: Array.isArray(data.categories) ? data.categories : null
                    };
                }
                return !!serverCatalog;
            })
            .catch(function () { return false; })
            .then(function (loaded) {
                if (window.dispatchEvent && typeof window.Event === 'function') {
                    window.dispatchEvent(new window.Event('msm:catalog'));
                }
                return loaded;
            });
    }

    // Push the full catalog to the shared server (debounced, fire-and-forget).
    // Rapid successive admin saves collapse into a single upload. The push
    // is skipped entirely when nothing changed, and never queues a second
    // request while one is already in flight, so saving stays instant even
    // if the server is slow.
    var catalogPushTimer = null;
    var catalogPushInFlight = false;
    var catalogPushDirty = false;
    var lastCatalogPushJson = '';
    function pushCatalogToRemote() {
        var url = catalogApiUrl();
        if (!url) return true;
        if (catalogPushTimer) clearTimeout(catalogPushTimer);
        catalogPushTimer = setTimeout(function () {
            catalogPushTimer = null;
            var snapshot = JSON.stringify({ products: getProducts(), categories: getCategories(), departments: getDepartments() });
            if (snapshot === lastCatalogPushJson) return;
            if (catalogPushInFlight) { catalogPushDirty = true; return; }
            catalogPushInFlight = true;
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: snapshot
            }).then(function () {
                lastCatalogPushJson = snapshot;
            }).catch(function () { /* server not available */ })
              .finally(function () {
                catalogPushInFlight = false;
                if (catalogPushDirty) { catalogPushDirty = false; pushCatalogToRemote(); }
            });
        }, 250);
        return true;
    }

    // Run cb once the shared catalog has been fetched (best-effort).
    function readyCatalog(cb) {
        fetchCatalogRemote().then(function () { if (cb) cb(); });
    }

    function getDepartments() {
        if (serverCatalog && Array.isArray(serverCatalog.departments)) return serverCatalog.departments;
        if (typeof DEFAULT_DEPARTMENTS !== 'undefined' && Array.isArray(DEFAULT_DEPARTMENTS)) return DEFAULT_DEPARTMENTS;
        return ['UCC', 'PUCC'];
    }

    function sortCategoriesByOrder(list) {
        return list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    }

    function sortProductsByOrder(list) {
        return list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    }

    // Merge defaults + admin changes into a single product list.
    // Optional department argument filters to one department.
    function getProducts(department) {
        var list;
        if (serverCatalog && Array.isArray(serverCatalog.products)) {
            list = serverCatalog.products.map(function (p) { return Object.assign({}, p); });
        } else {
            list = DEFAULT_PRODUCTS.map(function (p) { return Object.assign({}, p); });
            var delta = readStore(KEYS.products, null);
            if (delta && typeof delta === 'object') {
                if (Array.isArray(delta.added)) {
                    delta.added.forEach(function (p) { list.push(Object.assign({}, p)); });
                }
                if (delta.edited && typeof delta.edited === 'object') {
                    Object.keys(delta.edited).forEach(function (code) {
                        var i = list.findIndex(function (p) { return p.code === code; });
                        if (i > -1) list[i] = Object.assign({}, list[i], delta.edited[code]);
                    });
                }
                if (Array.isArray(delta.deleted)) {
                    list = list.filter(function (p) { return delta.deleted.indexOf(p.code) === -1; });
                }
            }
        }
        list = sortProductsByOrder(list);
        if (department) {
            list = list.filter(function (p) {
                var d = p.department || '';
                return d === department || d === 'Both' || d === 'All';
            });
        }
        return list;
    }

    // Store the CURRENT full product list, re-computing the diff versus
    // the defaults stored in data.js, and share it with the server.
    function saveProducts(list) {
        var defaultMap = {};
        DEFAULT_PRODUCTS.forEach(function (p) { defaultMap[p.code] = p; });

        var added = [];
        var edited = {};
        var deleted = [];
        var seen = {};

        list.forEach(function (p) {
            seen[p.code] = true;
            if (!defaultMap[p.code]) {
                added.push(Object.assign({}, p));
            } else if (!objectsEqual(p, defaultMap[p.code])) {
                edited[p.code] = Object.assign({}, p);
            }
        });

        DEFAULT_PRODUCTS.forEach(function (p) {
            if (!seen[p.code]) deleted.push(p.code);
        });

        if (!added.length && !Object.keys(edited).length && !deleted.length) {
            writeStore(KEYS.products, { added: [], edited: {}, deleted: [] });
        } else {
            writeStore(KEYS.products, { added: added, edited: edited, deleted: deleted });
        }
        if (serverCatalog) {
            serverCatalog.products = list.map(function (p) { return Object.assign({}, p); });
        }
        pushCatalogToRemote();
        return getProducts();
    }

    function getProduct(code) {
        return getProducts().find(function (p) { return p.code === code; }) || null;
    }

    /* ------------------------------------------------------------------
       CATEGORIES HELPERS
       Like products, categories merge default data.js entries with any
       admin-added / edited / deleted categories stored in LocalStorage.
       `id` is stable and never changes, so edits (incl. renames) and
       deletions can always be matched back to the default.
    ------------------------------------------------------------------ */
    function getCategories(department) {
        var list;
        if (serverCatalog && Array.isArray(serverCatalog.categories)) {
            list = serverCatalog.categories.map(function (c) { return Object.assign({}, c); });
        } else {
            list = DEFAULT_CATEGORIES.map(function (c) { return Object.assign({}, c); });
            var delta = readStore(KEYS.categories, null);
            if (delta && typeof delta === 'object') {
                if (delta.edited && typeof delta.edited === 'object') {
                    Object.keys(delta.edited).forEach(function (id) {
                        var i = list.findIndex(function (c) { return c.id === id; });
                        if (i > -1) list[i] = Object.assign({}, list[i], delta.edited[id]);
                    });
                }
                if (Array.isArray(delta.added)) {
                    delta.added.forEach(function (c) { list.push(Object.assign({}, c)); });
                }
                if (Array.isArray(delta.deleted)) {
                    list = list.filter(function (c) { return delta.deleted.indexOf(c.id) === -1; });
                }
            }
        }
        // Categories are shared — every category appears in every department.
        // (The `department` argument is kept for API compatibility but does not
        // filter, so UCC and PUCC pages always show the same category list.)
        list = sortCategoriesByOrder(list);
        return list;
    }

    // Store the CURRENT full category list, recomputing the diff against
    // the defaults stored in data.js, and share it with the server.
    function saveCategories(list) {
        var defaultMap = {};
        DEFAULT_CATEGORIES.forEach(function (c) { defaultMap[c.id] = c; });

        var added = [];
        var edited = {};
        var deleted = [];
        var seen = {};

        list.forEach(function (c) {
            seen[c.id] = true;
            if (!defaultMap[c.id]) {
                added.push(Object.assign({}, c));
            } else if (!objectsEqual(c, defaultMap[c.id])) {
                edited[c.id] = Object.assign({}, c);
            }
        });

        DEFAULT_CATEGORIES.forEach(function (c) {
            if (!seen[c.id]) deleted.push(c.id);
        });

        if (!added.length && !Object.keys(edited).length && !deleted.length) {
            writeStore(KEYS.categories, { added: [], edited: {}, deleted: [] });
        } else {
            writeStore(KEYS.categories, { added: added, edited: edited, deleted: deleted });
        }
        if (serverCatalog) {
            serverCatalog.categories = list.map(function (c) { return Object.assign({}, c); });
        }
        pushCatalogToRemote();
        return getCategories();
    }

    // Creates a stable slug id from a category name (for admin-added ones).
    function categoryIdFromName(name) {
        var base = String(name || '').trim().toLowerCase();
        return base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
    }

    function getCategory(nameOrId) {
        var q = String(nameOrId || '').trim().toLowerCase();
        if (!q) return null;
        return getCategories().find(function (c) {
            return c.name.toLowerCase() === q || c.id.toLowerCase() === q;
        }) || null;
    }

    /* ------------------------------------------------------------------
       CART
    ------------------------------------------------------------------ */
    function getCart() {
        var cart = readStore(KEYS.cart, []);
        return Array.isArray(cart) ? cart : [];
    }

    function saveCart(cart) {
        writeStore(KEYS.cart, cart);
    }

    function clearCart() {
        writeStore(KEYS.cart, []);
    }

    // Add / merge an item. If the product is already in the cart its
    // quantity increases instead of creating a duplicate line.
    function addToCart(item) {
        var cart = getCart();
        var found = cart.find(function (i) { return i.code === item.code; });
        if (found) {
            found.quantity = (found.quantity || 0) + (item.quantity || 1);
        } else {
            cart.push({
                code: item.code,
                name: item.name,
                unit: item.unit || '',
                quantity: item.quantity || 1
            });
        }
        saveCart(cart);
        refreshCartCount();
        return cart;
    }

    function updateCartItemQty(code, qty) {
        qty = sanitizeQuantity(qty);
        var cart = getCart();
        var found = cart.find(function (i) { return i.code === code; });
        if (found) found.quantity = qty;
        saveCart(cart);
        refreshCartCount();
        return cart;
    }

    function removeFromCart(code) {
        var cart = getCart().filter(function (i) { return i.code !== code; });
        saveCart(cart);
        refreshCartCount();
        return cart;
    }

    function getCartTotals() {
        var cart = getCart();
        var items = 0;
        cart.forEach(function (i) { items += i.quantity; });
        return { products: cart.length, items: items };
    }

    /* ------------------------------------------------------------------
       ORDERS
       Orders are stored locally (offline-friendly). When the app is
       served over HTTP and a sync endpoint is available, orders are
       also pushed to the shared order inbox so that "share link"
       customers' orders reach the admin (see server.js /api/orders).

       FUTURE BACKEND NOTE:
       Point syncApi at Supabase / Firebase and orders will travel to a
       real database instead of the demo file-based inbox.
    ------------------------------------------------------------------ */
    function getOrders() {
        var orders = readStore(KEYS.orders, []);
        return Array.isArray(orders) ? orders : [];
    }

    function saveOrdersRaw(orders) {
        writeStore(KEYS.orders, orders);
    }

    // FUTURE: Replace with database insert (e.g. Supabase .insert()).
    function saveOrder(order) {
        var orders = getOrders();
        orders.push(order);
        writeStore(KEYS.orders, orders);
        return order;
    }

    function getOrder(orderId) {
        return getOrders().find(function (o) { return o.orderId === orderId; }) || null;
    }

    function deleteOrder(orderId) {
        var list = getOrders().filter(function (o) { return o.orderId !== orderId; });
        saveOrdersRaw(list);
        var url = getSyncApiUrl();
        if (url) {
            fetch(url, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId: orderId })
            }).catch(function () { /* silent */ });
        }
        return list;
    }

    function clearAllOrders() {
        var previous = getOrders();
        saveOrdersRaw([]);
        var url = getSyncApiUrl();
        if (url) {
            fetch(url, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clear: true })
            }).catch(function () { /* silent */ });
        }
        return previous;
    }

    /* ------------------------------------------------------------------
       SHARED ORDER INBOX (optional sync layer)
       Works without a server:
         - file:// (opened directly)  -> sync disabled, LocalStorage only.
         - served over http(s)        -> auto-syncs to same-origin
           /api/orders if that endpoint exists. All failures are silent.
    ------------------------------------------------------------------ */
    function getSyncApiUrl() {
        var override = readStore(KEYS.syncApi, null);
        if (typeof override === 'string' && override !== '') {
            return override === 'off' ? '' : override;
        }
        var proto = window.location && window.location.protocol ? window.location.protocol : '';
        if (proto.indexOf('http') === 0 && window.location.origin) {
            return window.location.origin + '/api/orders';
        }
        return '';
    }

    function syncEnabled() {
        return !!getSyncApiUrl();
    }

    // Fire-and-forget push of one order to the shared inbox.
    function postOrderToInbox(order) {
        var url = getSyncApiUrl();
        if (!url || !order) return Promise.resolve();
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order)
        }).then(function (r) {
            if (!r.ok) throw new Error('sync http ' + r.status);
        }).catch(function () { /* silent: server not available */ });
    }

    function fetchInboxOrders() {
        var url = getSyncApiUrl();
        if (!url) return Promise.resolve([]);
        return fetch(url, { method: 'GET' }).then(function (r) {
            if (!r.ok) throw new Error('sync http ' + r.status);
            return r.json();
        }).catch(function () { return []; });
    }

    // Pull orders from the shared inbox into local storage and push any
    // local orders that haven't reached the inbox yet. Dedupes by orderId.
    // FUTURE BACKEND NOTE: Replace with a Supabase query + upsert.
    function refreshOrdersFromRemote(onDone) {
        if (!syncEnabled()) {
            if (onDone) onDone();
            return;
        }
        var localOrders = getOrders();
        fetchInboxOrders().then(function (remote) {
            if (!Array.isArray(remote)) remote = [];
            var local = localOrders.slice();
            var localIds = {};
            var remoteIds = {};
            local.forEach(function (o) { if (o && o.orderId) localIds[o.orderId] = true; });

            // Merge remote orders we don't have locally
            var changed = false;
            remote.forEach(function (o) {
                if (o && o.orderId) {
                    remoteIds[o.orderId] = true;
                    if (!localIds[o.orderId]) {
                        local.push(o);
                        localIds[o.orderId] = true;
                        changed = true;
                    }
                }
            });
            if (changed) saveOrdersRaw(local);

            // Push local orders the inbox doesn't know about yet
            var toPush = local.filter(function (o) { return o && o.orderId && !remoteIds[o.orderId]; });
            var chain = Promise.resolve();
            toPush.forEach(function (o) {
                chain = chain.then(function () { return postOrderToInbox(o); });
            });
            chain.then(function () {
                if (onDone) onDone();
            });
        });
    }

    function pad(n, len) {
        n = String(n);
        len = len || 2;
        while (n.length < len) n = '0' + n;
        return n;
    }

    function todayKey() {
        var d = new Date();
        return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    }

    // Generates an order number like ORD-20260911-001.
    function generateOrderId() {
        var prefix = 'ORD-' + todayKey() + '-';
        var count = getOrders().filter(function (o) {
            return o.orderId && o.orderId.indexOf(prefix) === 0;
        }).length;
        return prefix + pad(count + 1, 3);
    }

    function createOrderFromCart(cart) {
        var now = new Date();
        var time = pad(now.getHours()) + ':' + pad(now.getMinutes());
        return {
            orderId: generateOrderId(),
            date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
            time: time,
            status: 'Submitted',
            items: cart.map(function (i) {
                return {
                    code: i.code,
                    name: i.name,
                    quantity: i.quantity,
                    unit: i.unit || ''
                };
            })
        };
    }

    /* ------------------------------------------------------------------
       QUANTITY HELPERS
    ------------------------------------------------------------------ */
    // Keeps a value inside [1, max]. max default 9999.
    function sanitizeQuantity(qty, max) {
        qty = parseInt(qty, 10);
        if (isNaN(qty) || qty < 1) qty = 1;
        max = (max === undefined || max < 1) ? 9999 : max;
        return Math.min(qty, max);
    }

    /* ------------------------------------------------------------------
       FORMATTING / UTILITY
    ------------------------------------------------------------------ */
    function escapeHtml(str) {
        return String(str === undefined || str === null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function objectsEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // "2026-09-11" -> "11 Sep 2026"
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        var d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d.getTime())) return dateStr;
        return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
    }

    function getQueryParams() {
        return new URLSearchParams(window.location.search);
    }

    // Par level for a product as seen from a department.
    // `parUCC` / `parPUCC` (optional overrides) win over the shared `parLevel`,
    // so a "Both" product can hold a different par per department. Without a
    // department the shared parLevel is returned.
    function getParLevel(product, dept) {
        if (!product) return 0;
        if (dept) {
            var over = product['par' + dept];
            if (over !== undefined && over !== null && over !== '') {
                var v = parseInt(over, 10);
                if (!isNaN(v)) return v;
            }
        }
        var base = parseInt(product.parLevel, 10);
        return isNaN(base) ? 0 : base;
    }

    // Set a product's par level for a department. Single-department products
    // keep the shared parLevel in sync; "Both" products keep per-dept values.
    function setProductPar(product, dept, value) {
        // differentiates undefined-vs-0; the value is a positive int or excluded
        var num = (value === '' || value === null || value === undefined) ? undefined : Math.max(0, parseInt(value, 10));
        if (num === undefined) {
            if (dept) product['par' + dept] = undefined;
            return;
        }
        if (dept) {
            product['par' + dept] = num;
            if (product.department !== 'Both' && product.department !== 'All') product.parLevel = num;
        } else {
            product.parLevel = num;
        }
    }

    /* Stock status: 0 Out of Stock | stock < par Level Low | >= par In Stock */
    function getStockStatus(product, dept) {
        var stock = parseInt(product.stock, 10);
        var par = getParLevel(product, dept);
        if (isNaN(stock) || stock <= 0) return { key: 'out', label: 'Out of Stock' };
        if (par > 0 && stock < par) return { key: 'low', label: 'Low Stock' };
        return { key: 'ok', label: 'In Stock' };
    }

    /* ------------------------------------------------------------------
       HEADER
    ------------------------------------------------------------------ */
    function injectHeader() {
        var host = document.getElementById('siteHeader');
        if (!host) return;

        host.innerHTML =
            '<div class="header-inner">' +
            '  <a href="index.html" class="logo">' +
            '    <span class="logo__icon"><i class="fa-solid fa-house-medical" aria-hidden="true"></i></span>' +
            '    <span class="logo__text"><span>PEH</span> Medical <em>Supply</em></span>' +
            '  </a>' +
            '  <button class="menu-toggle" id="menuToggle" aria-label="Toggle menu" aria-expanded="false">' +
            '    <i class="fa-solid fa-bars" aria-hidden="true"></i>' +
            '  </button>' +
            '  <nav class="site-nav" id="siteNav" aria-label="Main navigation">' +
            '    <a href="index.html" data-nav="home">Home</a>' +
            '    <a href="index.html#departments" data-nav="departments">Departments</a>' +
            '    <a href="cart.html" data-nav="cart">Cart</a>' +
            '    <a href="orders.html" data-nav="orders">Orders</a>' +
            '  </nav>' +
            '  <form class="header-search" id="globalSearchForm" role="search">' +
            '    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
            '    <input type="search" id="globalSearchInput" placeholder="Search code, product or category…" aria-label="Search products">' +
            '  </form>' +
            '  <a href="admin.html" class="header-login" title="Admin login">' +
            '    <span class="header-login__label">Admin Login</span>' +
            '    <i class="fa-solid fa-user-shield" aria-hidden="true"></i>' +
            '  </a>' +
            '  <a href="cart.html" class="cart-link" title="Shopping cart">' +
            '    <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>' +
            '    <span class="cart-badge" id="cartCount">0</span>' +
            '  </a>' +
            '</div>';

        // Mobile hamburger menu
        var toggle = document.getElementById('menuToggle');
        var header = host;
        toggle.addEventListener('click', function () {
            var open = header.classList.toggle('nav-open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        // Global search -> products page
        host.querySelector('#globalSearchForm').addEventListener('submit', function (e) {
            e.preventDefault();
            var q = host.querySelector('#globalSearchInput').value.trim();
            var target = q
                ? 'products.html?search=' + encodeURIComponent(q)
                : 'products.html';
            window.location.href = target;
        });

        refreshCartCount();
        setActiveNav();
    }

    function setActiveNav() {
        var page = (document.body.getAttribute('data-page') || '').toLowerCase();
        var map = {
            home: 'home',
            products: 'products',
            cart: 'cart',
            orders: 'orders'
        };
        var target = map[page];
        if (!target) return;
        var links = document.querySelectorAll('#siteNav a[data-nav]');
        var fallback = (page === 'products') ? 'categories' : target;
        Array.prototype.forEach.call(links, function (a) {
            var n = a.getAttribute('data-nav');
            if (n === target || (page === 'products' && n === fallback)) {
                a.classList.add('is-active');
            }
        });
    }

    function refreshCartCount() {
        var totals = getCartTotals();
        var badges = document.querySelectorAll('#cartCount');
        Array.prototype.forEach.call(badges, function (b) {
            b.textContent = totals.items;
            b.classList.toggle('has-items', totals.items > 0);
        });
    }

    /* ------------------------------------------------------------------
       TOAST NOTIFICATION
    ------------------------------------------------------------------ */
    function showToast(message, type, actionLabel, actionFn) {
        var existing = document.querySelector('.toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'toast toast--' + (type || 'info');
        var icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-xmark',
            warning: 'fa-triangle-exclamation',
            info: 'fa-circle-info'
        };
        var actionHtml = (actionLabel && typeof actionFn === 'function')
            ? '<button type="button" class="toast-action">' + escapeHtml(actionLabel) + '</button>'
            : '';
        toast.innerHTML =
            '<i class="fa-solid ' + (icons[type] || icons.info) + '" aria-hidden="true"></i>' +
            '<span>' + escapeHtml(message) + '</span>' +
            actionHtml;
        document.body.appendChild(toast);

        if (actionHtml) {
            toast.querySelector('.toast-action').addEventListener('click', function () {
                clearTimeout(timer);
                if (toast.parentNode) toast.parentNode.removeChild(toast);
                actionFn();
            });
        }

        var timer = window.setTimeout(function () {
            toast.classList.add('toast--hide');
            window.setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
        }, 2600);
    }

    /* ------------------------------------------------------------------
       MODAL DIALOG
       openDialog({
           title: '...',
           body:  'html string'   (or DOM element),
           size:  'lg' | 'sm' | undefined,
           closable: true/false (default true),
           buttons: [ { label, className, onClick, keepOpen } ],
           onClose: fn
       })
    ------------------------------------------------------------------ */
    function openDialog(opts) {
        opts = opts || {};
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        var modal = document.createElement('div');
        modal.className = 'modal' + (opts.size === 'lg' ? ' modal--lg' : '') + (opts.size === 'sm' ? ' modal--sm' : '');

        var head = document.createElement('div');
        head.className = 'modal__header';
        head.innerHTML = '<h3 class="modal__title">' + escapeHtml(opts.title || '') + '</h3>';
        if (opts.closable !== false) {
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'modal__close';
            closeBtn.setAttribute('aria-label', 'Close');
            closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
            closeBtn.addEventListener('click', function () { cleanup(); });
            head.appendChild(closeBtn);
        }

        var body = document.createElement('div');
        body.className = 'modal__body';
        if (opts.body instanceof HTMLElement) {
            body.appendChild(opts.body);
        } else {
            body.innerHTML = opts.body || '';
        }

        var foot = null;
        if (opts.buttons && opts.buttons.length) {
            foot = document.createElement('div');
            foot.className = 'modal__footer';
            opts.buttons.forEach(function (btn) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn ' + (btn.className || 'btn-primary');
                b.innerHTML = btn.label;
                b.addEventListener('click', function () {
                    if (btn.onClick) btn.onClick();
                    if (!btn.keepOpen) cleanup();
                });
                foot.appendChild(b);
            });
        }

        modal.appendChild(head);
        modal.appendChild(body);
        if (foot) modal.appendChild(foot);
        overlay.appendChild(modal);

        function onKey(e) {
            if (e.key === 'Escape' && opts.closable !== false) cleanup();
        }
        function cleanup() {
            document.removeEventListener('keydown', onKey, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (opts.onClose) opts.onClose();
            document.body.classList.remove('no-scroll');
        }

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && opts.closable !== false) cleanup();
        });

        document.addEventListener('keydown', onKey, true);
        document.body.classList.add('no-scroll');
        document.body.appendChild(overlay);

        // Convenience handle for programmatic closing (used by admin forms)
        window.__lastDialog = { el: overlay, close: cleanup };

        return { el: overlay, close: cleanup };
    }

    /* ------------------------------------------------------------------
       EMPTY STATE MARKUP
    ------------------------------------------------------------------ */
    function emptyState(icon, title, text, actionHtml) {
        return '<div class="empty-state">' +
            '<div class="empty-state__icon"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></div>' +
            '<h3>' + escapeHtml(title) + '</h3>' +
            (text ? '<p>' + escapeHtml(text) + '</p>' : '') +
            (actionHtml ? '<div class="empty-state__action">' + actionHtml + '</div>' : '') +
            '</div>';
    }

    /* ------------------------------------------------------------------
       INIT — runs on every page
    ------------------------------------------------------------------ */
    function initApp() {
        injectHeader();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    /* ------------------------------------------------------------------
       PUBLIC API (global functions, replaces LocalStorage later)
    ------------------------------------------------------------------ */
    window.HAS_LOCAL_STORAGE = HAS_LOCAL_STORAGE;
    window.MSM_KEYS = KEYS;

    // storage
    window.readStore = readStore;
    window.writeStore = writeStore;

// products
    window.getProducts = getProducts;
    window.saveProducts = saveProducts;
    window.getProduct = getProduct;
    window.getDepartments = getDepartments;

    // categories
    window.getCategories = getCategories;
    window.saveCategories = saveCategories;
    window.getCategory = getCategory;
    window.categoryIdFromName = categoryIdFromName;

    // cart
    window.getCart = getCart;
    window.saveCart = saveCart;
    window.clearCart = clearCart;
    window.addToCart = addToCart;
    window.updateCartItemQty = updateCartItemQty;
    window.removeFromCart = removeFromCart;
    window.getCartTotals = getCartTotals;

    // orders
    window.getOrders = getOrders;
    window.saveOrder = saveOrder;
    window.saveOrdersRaw = saveOrdersRaw;
    window.getOrder = getOrder;
    window.deleteOrder = deleteOrder;
    window.clearAllOrders = clearAllOrders;
    window.generateOrderId = generateOrderId;
    window.createOrderFromCart = createOrderFromCart;

    // shared order inbox (optional sync layer)
    window.getSyncApiUrl = getSyncApiUrl;
    window.syncEnabled = syncEnabled;
    window.postOrderToInbox = postOrderToInbox;
    window.refreshOrdersFromRemote = refreshOrdersFromRemote;
    window.setSyncApiUrl = function (url) { writeStore(KEYS.syncApi, url || ''); };

    // shared product catalog (server-side copy of admin edits)
    window.fetchCatalogRemote = fetchCatalogRemote;
    window.readyCatalog = readyCatalog;
    window.pushCatalogToRemote = pushCatalogToRemote;
    window.catalogApiUrl = catalogApiUrl;

    // helpers
    window.sanitizeQuantity = sanitizeQuantity;
    window.escapeHtml = escapeHtml;
    window.formatDate = formatDate;
    window.getQueryParams = getQueryParams;
    window.getStockStatus = getStockStatus;
    window.getParLevel = getParLevel;
    window.setProductPar = setProductPar;
    window.showToast = showToast;
    window.openDialog = openDialog;
    window.emptyState = emptyState;
    window.refreshCartCount = refreshCartCount;
    window.pad = pad;

    // Boot: pull the shared catalog (when a server is reachable) and
    // dispatch the 'msm:catalog' event so every page re-renders once
    // admin edits are loaded.
    function bootCatalog() { fetchCatalogRemote(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootCatalog);
    } else {
        bootCatalog();
    }
})();