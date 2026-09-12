/**
 * ============================================================
 *  PEH Medical Supply — js/admin.js
 * ------------------------------------------------------------
 *  Admin Dashboard:
 *    - Demo login (admin / admin123)
 *    - Overview cards + low stock alerts
 *    - Weekly demand table (computed from real submitted orders)
 *    - Product management (CRUD, persisted via app.js merge)
 *    - Order history table
 *    - Demand analytics charts (Chart.js)
 *
 *  FUTURE BACKEND NOTE:
 *  Replace readStore / writeStore calls with Supabase / Firebase
 *  queries. The rest of the logic stays the same.
 * ============================================================
 */

(function () {
    'use strict';

    /* ------------------------------------------------------------------
       STATE
    ------------------------------------------------------------------ */
    var adminRange = 'this-week';           // 'this-week' | 'last-4-weeks'
    var analyticsRange = 'this-week';
    var topChart = null;   // Chart.js instance
    var catChart = null;   // Chart.js instance

    var currentDept = 'All'; // 'All' | 'UCC' | 'PUCC' — active department filter

    function activeDept() {
        return currentDept === 'All' ? null : currentDept;
    }

    /* ------------------------------------------------------------------
       DEPARTMENT TABS
    ------------------------------------------------------------------ */
    function renderDeptTabs() {
        var el = document.getElementById('adminDeptTabs');
        if (!el) return;
        var depts = ['All'].concat(getDepartments());
        el.innerHTML = depts.map(function (d) {
            var active = d === currentDept ? ' is-active' : '';
            return '<button class="dept-tabs__btn' + active + '" data-dept="' + escapeHtml(d) + '">' + escapeHtml(d) + '</button>';
        }).join('');
        el.addEventListener('click', function (e) {
            var btn = e.target.closest('.dept-tabs__btn');
            if (!btn) return;
            var dept = btn.getAttribute('data-dept');
            if (dept === currentDept) return;
            currentDept = dept;
            renderDeptTabs();
            refreshCurrentSection();
        });
    }

    function refreshCurrentSection() {
        var active = document.querySelector('#adminShell .admin-sidebar button.is-active');
        var section = active ? active.getAttribute('data-section') : 'overview';
        switchSection(section);
    }

    /* ------------------------------------------------------------------
       WEEK HELPERS (ISO week)
    ------------------------------------------------------------------ */
    // Returns { start: Date(Monday), end: Date(Sunday) } for the week
    // that contains `date`.
    function weekBounds(date) {
        var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        var day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
        var start = new Date(d);
        start.setDate(d.getDate() - day);
        var end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { start: start, end: end };
    }

    // Format date range for column header, e.g. "8 Sep – 14 Sep"
    function shortRange(start, end) {
        var mShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return mShort[start.getMonth()] + ' ' + start.getDate() +
               ' – ' + mShort[end.getMonth()] + ' ' + end.getDate();
    }

    // Date string "YYYY-MM-DD" from a Date object
    function isoDate(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    // Get the 4-week blocks for each range
    function getWeeksForRange(range) {
        var now = new Date();
        var currentWeek = weekBounds(now);
        var weeks = [];
        if (range === 'this-week') {
            // Weeks ending at the current week (current week is last column)
            for (var i = 3; i >= 0; i--) {
                var s = new Date(currentWeek.start);
                s.setDate(currentWeek.start.getDate() - (i * 7));
                var e = new Date(s);
                e.setDate(s.getDate() + 6);
                weeks.push({ start: s, end: e });
            }
        } else {
            // last 4 full weeks (exclude current)
            for (var j = 1; j <= 4; j++) {
                var s2 = new Date(currentWeek.start);
                s2.setDate(currentWeek.start.getDate() - (j * 7));
                var e2 = new Date(s2);
                e2.setDate(s2.getDate() + 6);
                weeks.push({ start: s2, end: e2 });
            }
            weeks.reverse(); // oldest first
        }
        return weeks;
    }

    /* ------------------------------------------------------------------
       WEEKLY DEMAND COMPUTATION
       Returns { weeks: [...], rows: [{code,name,category,w:[4],total,avg}] }
    ------------------------------------------------------------------ */
    function computeWeeklyDemand(range) {
        var weeks = getWeeksForRange(range);
        var orders = getOrders();
        var allProducts = getProducts();

        // Pre-fill demand matrix
        var demandMap = {}; // code -> {code,name,category,w:[0,0,0,0]}
        allProducts.forEach(function (p) {
            demandMap[p.code] = {
                code: p.code,
                name: p.name,
                category: p.category,
                w: [0, 0, 0, 0]
            };
        });

        // Sum quantities from orders in range
        var firstWeekStart = isoDate(weeks[0].start);
        var lastWeekEnd = isoDate(weeks[weeks.length - 1].end);

        orders.forEach(function (order) {
            if (!order.date || order.date < firstWeekStart || order.date > lastWeekEnd) return;
            var oDate = new Date(order.date + 'T00:00:00');
            var oWeek = weekBounds(oDate);
            // Find which column this order falls into
            var col = -1;
            for (var ci = 0; ci < weeks.length; ci++) {
                if (isoDate(oWeek.start) === isoDate(weeks[ci].start)) {
                    col = ci;
                    break;
                }
            }
            if (col === -1) return;
            (order.items || []).forEach(function (item) {
                if (!demandMap[item.code]) {
                    // Create entry for custom products not in defaults
                    demandMap[item.code] = {
                        code: item.code,
                        name: item.name,
                        category: item.category || '',
                        w: [0, 0, 0, 0]
                    };
                }
                demandMap[item.code].w[col] += parseInt(item.quantity, 10) || 0;
            });
        });

        // Build rows, filter to those with demand > 0, sort by total desc
        var rows = [];
        Object.keys(demandMap).forEach(function (code) {
            var r = demandMap[code];
            var total = r.w[0] + r.w[1] + r.w[2] + r.w[3];
            if (total > 0) {
                r.total = total;
                r.avg = +(total / 4).toFixed(2);
                rows.push(r);
            }
        });
        rows.sort(function (a, b) { return b.total - a.total; });

        return { weeks: weeks, rows: rows };
    }

    /* ------------------------------------------------------------------
       RENDER: OVERVIEW
    ------------------------------------------------------------------ */
    function renderOverview() {
        var products = getProducts();
        var orders = getOrders();
        var totals = getCartTotals();
        var weekOrders = ordersInCurrentWeek(orders);
        var totalItemsOrdered = orders.reduce(function (sum, o) {
            return sum + (o.items || []).reduce(function (s, i) { return s + (parseInt(i.quantity, 10) || 0); }, 0);
        }, 0);

        // Stat cards
        var statsHtml =
            '<div class="stat-card stat-card--blue"><span class="stat-card__icon"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span><div><strong>' + products.length + '</strong><span>Total Products</span></div></div>' +
            '<div class="stat-card stat-card--green"><span class="stat-card__icon"><i class="fa-solid fa-clipboard-list" aria-hidden="true"></i></span><div><strong>' + orders.length + '</strong><span>Total Orders</span></div></div>' +
            '<div class="stat-card stat-card--orange"><span class="stat-card__icon"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i></span><div><strong>' + weekOrders.length + '</strong><span>Orders This Week</span></div></div>' +
            '<div class="stat-card stat-card--purple"><span class="stat-card__icon"><i class="fa-solid fa-chart-simple" aria-hidden="true"></i></span><div><strong>' + totalItemsOrdered + '</strong><span>Items Ordered</span></div></div>';
        var statsEl = document.getElementById('overviewStats');
        if (statsEl) statsEl.innerHTML = statsHtml;

        // Low stock (below par level, measured against the active department's par)
        var lowStockProducts = products
            .filter(function (p) {
                var stock = parseInt(p.stock, 10);
                var par = getParLevel(p, activeDept());
                return par > 0 && stock < par;
            })
            .sort(function (a, b) { return parseInt(a.stock, 10) - parseInt(b.stock, 10); });

        var lowEl = document.getElementById('lowStockList');
        if (lowEl) {
            if (!lowStockProducts.length) {
                lowEl.innerHTML = '<li style="text-align:center;color:var(--muted);padding:18px;">No low stock items</li>';
            } else {
                lowEl.innerHTML = lowStockProducts.slice(0, 10).map(function (p) {
                    var stock = parseInt(p.stock, 10);
                    var statusClass = stock === 0 ? 'out' : 'low';
                    return '<li>' +
                        '<span class="left"><span class="badge badge--' + statusClass + '">' + stock + '</span> <code>' + escapeHtml(p.code) + '</code> <span class="name">' + escapeHtml(p.name) + '</span></span>' +
                        '</li>';
                }).join('');
            }
        }

        // Quick notes
        var notesEl = document.getElementById('quickNotes');
        if (notesEl) {
            notesEl.innerHTML =
                '<li><span class="left"><i class="fa-solid fa-circle-info" aria-hidden="true" style="color:var(--primary);"></i> Data is stored in your browser (LocalStorage).</span></li>' +
                '<li><span class="left"><i class="fa-solid fa-circle-info" aria-hidden="true" style="color:var(--teal);"></i> Weekly Demand is calculated from real submitted orders.</span></li>' +
                '<li><span class="left"><i class="fa-solid fa-circle-info" aria-hidden="true" style="color:var(--success);"></i> Products can be added/edited via Product Management.</span></li>' +
                '<li><span class="left"><i class="fa-solid fa-circle-info" aria-hidden="true" style="color:var(--warning);"></i> Ready for future backend integration.</span></li>';
        }
    }

    function ordersInCurrentWeek(orders) {
        var now = new Date();
        var bw = weekBounds(now);
        var ws = isoDate(bw.start);
        var we = isoDate(bw.end);
        return orders.filter(function (o) { return o.date && o.date >= ws && o.date <= we; });
    }

    /* ------------------------------------------------------------------
       RENDER: WEEKLY DEMAND TABLE
    ------------------------------------------------------------------ */
    function renderWeeklyDemand() {
        var wrap = document.getElementById('weeklyTableWrap');
        var caption = document.getElementById('weeklyCaption');
        if (!wrap) return;

        var result = computeWeeklyDemand(adminRange);
        var weeks = result.weeks;

        // Set range toggle active states
        var toggle = document.getElementById('rangeToggle');
        if (toggle) {
            Array.prototype.forEach.call(toggle.querySelectorAll('button'), function (b) {
                b.classList.toggle('is-active', b.getAttribute('data-range') === adminRange);
            });
        }

        if (!result.rows.length) {
            wrap.innerHTML = emptyState(
                'fa-calendar-week',
                'No demand data for this period',
                'Submit some orders and they will appear here.',
                '<a href="cart.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i> Go to Cart</a>'
            );
            if (caption) caption.textContent = '';
            return;
        }

        var headers = weeks.map(function (w, i) { return '<th class="num">Week ' + (i + 1) + '<br><small>' + shortRange(w.start, w.end) + '</small></th>'; }).join('');
        var rowsHtml = result.rows.map(function (r) {
            var cells = r.w.map(function (v) { return '<td class="num">' + v + '</td>'; }).join('');
            return '<tr>' +
                '<td><strong>' + escapeHtml(r.code) + '</strong></td>' +
                '<td>' + escapeHtml(r.name) + '</td>' +
                '<td>' + escapeHtml(r.category) + '</td>' +
                cells +
                '<td class="num"><strong>' + r.total + '</strong></td>' +
                '<td class="num">' + r.avg.toFixed(2) + '</td>' +
                '</tr>';
        }).join('');

        var totalAllProducts = result.rows.length;
        var totalAllQty = result.rows.reduce(function (s, r) { return s + r.total; }, 0);

        wrap.innerHTML =
            '<table class="table" id="weeklyTable">' +
            '<thead><tr><th>Code</th><th>Product Name</th><th>Category</th>' + headers +
            '<th class="num">Total</th><th class="num">Avg Weekly</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
            '</table>';

        if (caption) {
            caption.textContent = totalAllProducts + ' products · ' + totalAllQty + ' total items ordered during this period';
        }
    }

    /* ------------------------------------------------------------------
       RENDER: PRODUCT MANAGEMENT TABLE
    ------------------------------------------------------------------ */
    // Par value to show (and edit) for a product in the current admin context.
    function productParDisplay(p) {
        var dept = activeDept();
        if (dept) return { value: getParLevel(p, dept) };
        if (p.department === 'Both' || p.department === 'All') {
            return {
                both: true,
                text: 'U ' + getParLevel(p, 'UCC') + ' / P ' + getParLevel(p, 'PUCC')
            };
        }
        return { value: getParLevel(p, p.department || null) };
    }

    function renderProductTable() {
        var body = document.getElementById('productTableBody');
        if (!body) return;

        var products = getProducts(activeDept());
        products.sort(function (a, b) { return a.code.localeCompare(b.code); });

        var q = '';
        var searchEl = document.getElementById('productSearch');
        if (searchEl) q = (searchEl.value || '').trim().toLowerCase();
        if (q) {
            products = products.filter(function (p) {
                return (p.code || '').toLowerCase().indexOf(q) !== -1 ||
                       (p.name || '').toLowerCase().indexOf(q) !== -1 ||
                       (p.description || '').toLowerCase().indexOf(q) !== -1 ||
                       (p.category || '').toLowerCase().indexOf(q) !== -1 ||
                       (p.unit || '').toLowerCase().indexOf(q) !== -1;
            });
        }

        if (!products.length) {
            var txt = q
                ? 'No products match "' + escapeHtml(q) + '".'
                : (activeDept() ? 'No products found in ' + escapeHtml(currentDept) + '.' : 'No products found.');
            body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted);">' + txt + '</td></tr>';
            return;
        }

        var allCats = getCategories();
        var catOptions = allCats.map(function (c) {
            return '<option value="' + escapeHtml(c.name) + '">' + escapeHtml(c.name) + '</option>';
        }).join('');
        var deptOptions = ['UCC', 'PUCC', 'Both'].map(function (d) {
            return '<option value="' + d + '">' + d + '</option>';
        }).join('');

        body.innerHTML = products.map(function (p) {
            var parShow = productParDisplay(p);
            if (productEditCode === p.code) {
                return '<tr data-row-edit="' + escapeHtml(p.code) + '">' +
                    '<td><strong>' + escapeHtml(p.code) + '</strong></td>' +
                    '<td><input class="row-input row-input--wide" id="reName" value="' + escapeHtml(p.name) + '" aria-label="Product name"></td>' +
                    '<td><textarea class="row-input row-input--wide row-input--desc" id="reDesc" rows="2" aria-label="Description">' + escapeHtml(p.description || '') + '</textarea></td>' +
                    '<td><select class="row-input select" id="reCat" aria-label="Category">' + catOptions + '</select></td>' +
                    '<td><select class="row-input select" id="reDept" aria-label="Department">' + deptOptions + '</select></td>' +
                    '<td><input class="row-input" id="reUnit" value="' + escapeHtml(p.unit) + '" aria-label="Unit"></td>' +
                    '<td><input class="row-input row-input--num" id="reStock" type="number" min="0" value="' + parseInt(p.stock, 10) + '" aria-label="Stock"></td>' +
                    '<td><input class="row-input row-input--num" id="rePar" type="number" min="0" value="' + (parShow.value === undefined ? getParLevel(p, 'UCC') : parShow.value) + '" aria-label="Par level"' + (parShow.both ? '' : '') + '></td>' +
                    '<td colspan="2" class="row-edit-cell">' +
                    '  <span class="row-edit-error" id="reError"></span>' +
                    '  <button class="btn btn-success btn-sm row-save-btn" data-code="' + escapeHtml(p.code) + '"><i class="fa-solid fa-check" aria-hidden="true"></i> Save</button>' +
                    '  <button class="btn btn-ghost btn-sm row-cancel-btn"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
                    '</td>' +
                    '</tr>';
            }
            var st = getStockStatus(p, activeDept() || (p.department === 'Both' || p.department === 'All' ? null : p.department));
            var parCell = parShow.both
                ? '<td class="num" title="Par: UCC = ' + parShow.text + '">' + parShow.text + '</td>'
                : '<td class="num">' + parShow.value + '</td>';
            return '<tr data-p-code="' + escapeHtml(p.code) + '">' +
                '<td><strong>' + escapeHtml(p.code) + '</strong></td>' +
                '<td>' + escapeHtml(p.name) + '</td>' +
                '<td class="cell-desc">' + escapeHtml(p.description || '') + '</td>' +
                '<td>' + escapeHtml(p.category) + '</td>' +
                '<td>' + escapeHtml(p.department || '') + '</td>' +
                '<td>' + escapeHtml(p.unit) + '</td>' +
                '<td class="num">' + parseInt(p.stock, 10) + '</td>' +
                parCell +
                '<td><span class="badge badge--' + st.key + '">' + st.label + '</span></td>' +
                '<td class="num">' +
                '  <button class="btn btn-outline btn-sm edit-btn" data-code="' + escapeHtml(p.code) + '" style="margin-right:4px;"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
                '  <button class="btn btn-ghost btn-sm icon-btn--danger del-btn" data-code="' + escapeHtml(p.code) + '"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
                '</td>' +
                '</tr>';
        }).join('');

        // Fill the editing row's selects with the current values
        if (productEditCode) {
            var editRow = body.querySelector('[data-row-edit]');
            var ep = getProduct(productEditCode);
            if (editRow && ep) {
                editRow.querySelector('#reCat').value = ep.category;
                editRow.querySelector('#reDept').value = ep.department === 'All' ? 'Both' : (ep.department || 'UCC');
            }
        }

        if (productEditCode) {
            var nameInput = body.querySelector('#reName');
            if (nameInput) nameInput.focus();
        }
    }

    // Inline row editing state: only one product row edits at a time.
    var productEditCode = null;

    function startInlineEdit(code) {
        if (productEditCode && productEditCode !== code) productEditCode = null;
        productEditCode = code;
        renderProductTable();
    }

    function saveInlineEdit() {
        var code = productEditCode;
        if (!code) return;
        var body = document.getElementById('productTableBody');
        var row = body ? body.querySelector('[data-row-edit]') : null;
        if (!row) { productEditCode = null; renderProductTable(); return; }

        var name = (row.querySelector('#reName').value || '').trim();
        var descInput = row.querySelector('#reDesc');
        var description = (descInput ? descInput.value : '').trim();
        var category = row.querySelector('#reCat').value || '';
        var department = row.querySelector('#reDept').value || 'UCC';
        var unit = (row.querySelector('#reUnit').value || '').trim();
        var stock = parseInt(row.querySelector('#reStock').value, 10);
        var par = parseInt(row.querySelector('#rePar').value, 10);
        var errEl = row.querySelector('#reError');

        if (!name) { errEl.textContent = 'Name is required.'; return; }
        if (!category) { errEl.textContent = 'Choose a category.'; return; }
        if (department !== 'UCC' && department !== 'PUCC' && department !== 'Both') department = 'UCC';
        if (!unit) { errEl.textContent = 'Unit is required.'; return; }
        if (isNaN(stock) || stock < 0) stock = 0;
        if (isNaN(par) || par < 0) par = 50;

        var list = getProducts();
        var idx = list.findIndex(function (p) { return p.code === code; });
        if (idx === -1) { productEditCode = null; renderProductTable(); return; }

        var updated = Object.assign({}, list[idx], {
            name: name,
            description: description,
            category: category,
            department: department,
            unit: unit,
            stock: stock
        });

        // The single par input applies to the department you are editing in:
        // shared (Both) products edited inside a dept tab get that dept's par;
        // single-department products get their own dept's par.
        var parTarget = (department === 'Both' || department === 'All') ? activeDept() : department;
        setProductPar(updated, parTarget, par);

        list[idx] = updated;

        saveProducts(list);
        productEditCode = null;
        renderProductTable();
        renderOverview();
        showToast(code + ' updated', 'success');
    }

    /* ------------------------------------------------------------------
       PRODUCT FORM (add / edit)
    ------------------------------------------------------------------ */
    function openProductForm(codeToEdit) {
        var isEdit = !!codeToEdit;
        var product = isEdit ? getProducts().find(function (p) { return p.code === codeToEdit; }) : null;

        var formDept = 'UCC';
        if (product && product.department) {
            formDept = product.department === 'All' ? 'Both' : product.department;
        } else if (activeDept()) {
            formDept = activeDept();
        }
        // Normalize: all options are UCC / PUCC / Both
        if (formDept !== 'UCC' && formDept !== 'PUCC') formDept = 'Both';

        var allCats = getCategories();
        var catOptionsFor = function (dept) {
            var cats = dept === 'Both' ? allCats.slice() : getCategories(dept);
            // Always include the edited product's category even if filtered out
            if (product && product.category && !cats.some(function (c) { return c.name === product.category; })) {
                var extra = allCats.find(function (c) { return c.name === product.category; });
                if (extra) cats = cats.concat([extra]);
            }
            return cats.map(function (c) {
                var sel = (product && product.category === c.name) ? ' selected' : '';
                return '<option value="' + escapeHtml(c.name) + '"' + sel + '>' + escapeHtml(c.name) + '</option>';
            }).join('');
        };

        var deptOptions = ['UCC', 'PUCC', 'Both'].map(function (d) {
            var sel = d === formDept ? ' selected' : '';
            return '<option value="' + d + '"' + sel + '>' + d + '</option>';
        }).join('');

        var formHtml =
            '<form id="productForm" class="form-grid" novalidate>' +
            '<div class="form-field">' +
            '  <label for="pfCode">Product Code</label>' +
            '  <input type="text" id="pfCode" required placeholder="e.g. ABC-001" value="' + (product ? escapeHtml(product.code) : '') + '"' + (isEdit ? ' readonly style="background:#f1f5f9;"' : '') + '>' +
            '</div>' +
            '<div class="form-field">' +
            '  <label for="pfDept">Department</label>' +
            '  <select id="pfDept">' + deptOptions + '</select>' +
            '</div>' +
            '<div class="form-field">' +
            '  <label for="pfName">Product Name</label>' +
            '  <input type="text" id="pfName" required placeholder="Product name" value="' + (product ? escapeHtml(product.name) : '') + '">' +
            '</div>' +
            '<div class="form-field">' +
            '  <label for="pfCategory">Category</label>' +
            '  <select id="pfCategory" required>' + catOptionsFor(formDept) + '</select>' +
            '</div>' +
            '<div class="form-field">' +
            '  <label for="pfUnit">Unit</label>' +
            '  <input type="text" id="pfUnit" required placeholder="Box, Each, Roll…" value="' + (product ? escapeHtml(product.unit) : '') + '">' +
            '</div>' +
            '<div class="form-field form-field--full">' +
            '  <label for="pfDesc">Description</label>' +
            '  <textarea id="pfDesc" placeholder="Short description…">' + (product ? escapeHtml(product.description) : '') + '</textarea>' +
            '</div>' +
            '<div class="form-field">' +
            '  <label for="pfStock">Stock</label>' +
            '  <input type="number" id="pfStock" min="0" value="' + (product ? parseInt(product.stock, 10) : 50) + '">' +
            '</div>' +
            '<div class="form-field" data-par="ucc">' +
            '  <label for="pfParUCC">Par Level (UCC)</label>' +
            '  <input type="number" id="pfParUCC" min="0" value="' + (product ? getParLevel(product, 'UCC') : 50) + '">' +
            '</div>' +
            '<div class="form-field" data-par="pucc">' +
            '  <label for="pfParPUCC">Par Level (PUCC)</label>' +
            '  <input type="number" id="pfParPUCC" min="0" value="' + (product ? getParLevel(product, 'PUCC') : 50) + '">' +
            '</div>' +
            '<div class="form-field form-field--full" style="margin-top:-4px;">' +
            '  <span style="font-size:11.5px;color:var(--muted);">Products shared between UCC and PUCC keep a separate par level per department.</span>' +
            '</div>' +
            '<div class="form-field form-field--full">' +
            '  <label for="pfImage">Image URL (optional)</label>' +
            '  <input type="url" id="pfImage" placeholder="https://example.com/images/product.jpg" value="' + (product ? escapeHtml(product.image || '') : '') + '">' +
            '  <div class="image-preview" id="pfImagePreview"></div>' +
            '</div>' +
            '<div class="form-field form-field--full">' +
            '  <div class="form-error" id="pfError"></div>' +
            '</div>' +
            '</form>';

        openDialog({
            title: isEdit ? 'Edit Product' : 'Add Product',
            body: formHtml,
            size: 'lg',
            closable: true,
            buttons: [
                { label: 'Cancel', className: 'btn btn-outline' },
                {
                    label: isEdit ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Save Changes' : '<i class="fa-solid fa-plus" aria-hidden="true"></i> Add Product',
                    className: 'btn btn-primary',
                    keepOpen: true,
                    onClick: function () { saveProductFromForm(codeToEdit); }
                }
            ]
        });

        // Live image preview
        var imageInput = document.getElementById('pfImage');
        if (imageInput) {
            imageInput.addEventListener('input', updateImagePreview);
            updateImagePreview();
        }

        // Changing the department re-filters the category options and shows
        // only the par field(s) for that department
        var deptSelect = document.getElementById('pfDept');
        var catSelect = document.getElementById('pfCategory');
        if (deptSelect && catSelect) {
            var rebuildCatOptions = function (dept) {
                var cats = dept === 'Both' ? allCats : getCategories(dept);
                return cats.map(function (c) {
                    var sel = (catSelect.value === c.name) ? ' selected' : '';
                    return '<option value="' + escapeHtml(c.name) + '"' + sel + '>' + escapeHtml(c.name) + '</option>';
                }).join('');
            };
            var toggleParFields = function (dept) {
                var uccField = document.querySelector('#productForm [data-par="ucc"]');
                var puccField = document.querySelector('#productForm [data-par="pucc"]');
                if (uccField) uccField.style.display = (dept === 'UCC' || dept === 'Both') ? '' : 'none';
                if (puccField) puccField.style.display = (dept === 'PUCC' || dept === 'Both') ? '' : 'none';
            };
            toggleParFields(deptSelect.value);
            deptSelect.addEventListener('change', function () {
                catSelect.innerHTML = rebuildCatOptions(deptSelect.value);
                toggleParFields(deptSelect.value);
            });
        }
    }

    function updateImagePreview() {
        var input = document.getElementById('pfImage');
        var preview = document.getElementById('pfImagePreview');
        if (!input || !preview) return;

        var url = (input.value || '').trim();
        if (!url) {
            preview.classList.remove('has-image');
            preview.innerHTML =
                '<span class="preview-inner"><i class="fa-solid fa-image" aria-hidden="true"></i> No image — a category-coloured icon is shown instead</span>';
            return;
        }

        preview.classList.add('has-image');
        preview.innerHTML = '<span class="preview-inner"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Loading…</span>';

        var img = new Image();
        var inner = document.createElement('span');
        inner.className = 'preview-inner';
        img.alt = 'Product image preview';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';

        img.onload = function () {
            preview.innerHTML = '';
            preview.appendChild(img);
        };
        img.onerror = function () {
            preview.innerHTML =
                '<span class="preview-inner"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Could not load image from this URL</span>';
        };
        img.src = url;
    }

    function saveProductFromForm(codeToEdit) {
        var codeEl = document.getElementById('pfCode');
        var nameEl = document.getElementById('pfName');
        var catEl = document.getElementById('pfCategory');
        var unitEl = document.getElementById('pfUnit');
        var descEl = document.getElementById('pfDesc');
        var stockEl = document.getElementById('pfStock');
        var parUccEl = document.getElementById('pfParUCC');
        var parPuccEl = document.getElementById('pfParPUCC');
        var imgEl = document.getElementById('pfImage');
        var errEl = document.getElementById('pfError');

        var code = (codeEl.value || '').trim();
        var name = (nameEl.value || '').trim();
        var category = (catEl.value || '').trim();
        var deptEl = document.getElementById('pfDept');
        var department = deptEl && deptEl.value ? deptEl.value : 'UCC';
        var unit = (unitEl.value || '').trim();
        var description = (descEl.value || '').trim();
        var stock = parseInt(stockEl.value, 10);
        var parUcc = parseInt(parUccEl && parUccEl.value, 10);
        var parPucc = parseInt(parPuccEl && parPuccEl.value, 10);
        var image = (imgEl.value || '').trim();

        // Validate
        if (!code) { showFieldError(errEl, 'Product code is required.'); codeEl.focus(); return; }
        if (!name) { showFieldError(errEl, 'Product name is required.'); nameEl.focus(); return; }
        if (!category) { showFieldError(errEl, 'Please select a category.'); catEl.focus(); return; }
        if (department !== 'UCC' && department !== 'PUCC' && department !== 'Both') {
            showFieldError(errEl, 'Department must be UCC, PUCC or Both.');
            return;
        }
        if (!unit) { showFieldError(errEl, 'Unit is required.'); unitEl.focus(); return; }
        if (isNaN(stock) || stock < 0) stock = 0;
        if (isNaN(parUcc) || parUcc < 0) parUcc = 50;
        if (isNaN(parPucc) || parPucc < 0) parPucc = 50;

        // Check duplicate code for new products
        var existing = getProducts();
        if (!codeToEdit && existing.some(function (p) { return p.code === code; })) {
            showFieldError(errEl, 'A product with code "' + code + '" already exists.');
            codeEl.focus();
            return;
        }

        var product = {
            id: code,
            code: code,
            name: name,
            category: category,
            department: department,
            description: description,
            unit: unit,
            stock: stock,
            parLevel: 50,
            image: image
        };
        // Apply the visible per-department par field(s). Single-department
        // products keep parLevel in sync via setProductPar; the hidden
        // override is cleared so stale values don't leak across depts.
        if (department === 'UCC') {
            setProductPar(product, 'UCC', parUcc);
            setProductPar(product, 'PUCC', undefined);
        } else if (department === 'PUCC') {
            setProductPar(product, 'PUCC', parPucc);
            setProductPar(product, 'UCC', undefined);
        } else {
            setProductPar(product, 'UCC', parUcc);
            setProductPar(product, 'PUCC', parPucc);
        }
        // Preserve the existing edit-order position so lists stay stable
        if (codeToEdit) {
            var prev = getProducts().find(function (p) { return p.code === codeToEdit; });
            if (prev && typeof prev.order !== 'undefined') product.order = prev.order;
            else if (!product.order) product.order = 999;
        } else if (!product.order) {
            product.order = 999;
        }

        // Merge
        var list = getProducts();
        if (codeToEdit) {
            list = list.map(function (p) { return p.code === codeToEdit ? product : p; });
        } else {
            list.push(product);
        }
        saveProducts(list);
        renderProductTable();
        renderOverview();
        showToast(codeToEdit ? 'Product updated' : 'Product added', 'success');

        // Close the open dialog cleanly (releases its Escape listener too)
        if (window.__lastDialog) window.__lastDialog.close();
    }

    function showFieldError(el, msg) {
        if (el) el.textContent = msg;
    }

    /* ------------------------------------------------------------------
       PRODUCT DELETE
    ------------------------------------------------------------------ */
    function deleteProduct(code) {
        var list = getProducts();
        var idx = list.findIndex(function (p) { return p.code === code; });
        if (idx === -1) return;
        var removed = JSON.parse(JSON.stringify(list[idx]));
        var cleaned = list.filter(function (p) { return p.code !== code; });
        saveProducts(cleaned);
        renderProductTable();
        renderOverview();
        showToast(code + ' deleted', 'success', 'Undo', function () {
            var cur = getProducts();
            var insertAt = Math.min(idx, cur.length);
            cur.splice(insertAt, 0, removed);
            saveProducts(cur);
            renderProductTable();
            renderOverview();
            showToast(code + ' restored', 'success');
        });
    }

    /* ------------------------------------------------------------------
       RENDER: CATEGORY MANAGEMENT TABLE
    ------------------------------------------------------------------ */
    var CATEGORY_ICONS = [
        'fa-boxes-stacked', 'fa-kit-medical', 'fa-capsules', 'fa-syringe',
        'fa-heart-pulse', 'fa-hand-holding-medical', 'fa-tablets', 'fa-bandage',
        'fa-wheelchair-move', 'fa-briefcase-medical', 'fa-bone', 'fa-eye',
        'fa-shoe-prints', 'fa-shield-virus', 'fa-virus', 'fa-drop',
        'fa-stethoscope', 'fa-x-ray', 'fa-temperature-high', 'fa-scalpel',
        'fa-mask-ventilator', 'fa-ear-listen', 'fa-tooth', 'fa-brain'
    ];
    var CATEGORY_COLORS = [
        '#0d6efd', '#12b886', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
        '#ec4899', '#64748b', '#f97316', '#84cc16', '#e11d48', '#0891b2',
        '#4f46e5', '#65a30d', '#b45309', '#dc2626', '#7c3aed', '#0e7490'
    ];

    // Categories are shared: the same list is shown on every department tab.
    // Pass `list` (from getCategories) to reuse the same object instances —
    // callers that then mutate and save MUST use the same snapshot.
    function categoryDisplayList(list) {
        return list || getCategories();
    }

    function renderCategoryTable() {
        var body = document.getElementById('categoryTableBody');
        if (!body) return;

        var categories = categoryDisplayList();
        var products = getProducts();

        if (!categories.length) {
            body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--muted);">No categories found.</td></tr>';
            return;
        }

        body.innerHTML = categories.map(function (c, i) {
            var count = products.filter(function (p) { return p.category === c.name; }).length;
            var color = c.color || '#0d6efd';
            var first = i === 0;
            var last = i === categories.length - 1;
            return '<tr data-cat-id="' + escapeHtml(c.id) + '" draggable="true">' +
                '<td class="cat-drag-cell"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></td>' +
                '<td><i class="fa-solid ' + escapeHtml(c.icon || 'fa-tag') + '" style="font-size:18px;color:' + escapeHtml(color) + ';" aria-hidden="true"></i></td>' +
                '<td><strong>' + escapeHtml(c.name) + '</strong><br><code style="font-size:11px;color:var(--muted);">' + escapeHtml(c.id) + '</code></td>' +
                '<td><span class="color-swatch" style="background:' + escapeHtml(color) + ';"></span> ' + escapeHtml(color).toUpperCase() + '</td>' +
                '<td class="num">' + count + '</td>' +
                '<td class="num" style="min-width:84px;">' +
                '  <button class="btn btn-ghost btn-sm cat-move-btn" data-id="' + escapeHtml(c.id) + '" data-dir="-1"' + (first ? ' disabled' : '') + ' title="Move up"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i></button>' +
                '  <button class="btn btn-ghost btn-sm cat-move-btn" data-id="' + escapeHtml(c.id) + '" data-dir="1"' + (last ? ' disabled' : '') + ' title="Move down"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i></button>' +
                '</td>' +
                '<td class="num">' +
                '  <button class="btn btn-outline btn-sm cat-edit-btn" data-id="' + escapeHtml(c.id) + '" style="margin-right:4px;"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>' +
                '  <button class="btn btn-ghost btn-sm icon-btn--danger cat-del-btn" data-id="' + escapeHtml(c.id) + '"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
                '</td>' +
                '</tr>';
        }).join('');
    }

    /* ------------------------------------------------------------------
       CATEGORY REORDER (sequence within the current department)
    ------------------------------------------------------------------ */
    function moveCategory(id, dir) {
        var full = getCategories();
        var categories = categoryDisplayList(full);
        if (categories.length < 2) return;
        var idx = categories.findIndex(function (c) { return c.id === id; });
        if (idx === -1) return;
        var other = categories[idx + dir];
        if (!other) return;

        // Swap to the neighbour; the whole list is one shared order.
        var aOrder = categories[idx].order || 0;
        var bOrder = other.order || 0;
        categories[idx].order = bOrder;
        other.order = aOrder;

        saveCategories(full); // same objects carry the swapped orders
        renderCategoryTable();
        showToast('Category reordered', 'success');
    }

    // Drag-and-drop reorder of the shared category list.
    function reorderCategory(draggedId, targetId, before) {
        var full = getCategories();
        var pool = categoryDisplayList(full);
        if (pool.length < 2) return;
        var fromIdx = -1;
        var toIdx = -1;
        pool.forEach(function (c, i) {
            if (c.id === draggedId) fromIdx = i;
            if (c.id === targetId) toIdx = i;
        });
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

        var moved = pool.splice(fromIdx, 1)[0];
        var insertAt = fromIdx < toIdx ? toIdx - 1 : toIdx;
        if (!before) insertAt = insertAt + 1;
        pool.splice(insertAt, 0, moved);

        // Re-number the whole shared list, then persist via the SAME objects
        // so the diff records the change.
        pool.forEach(function (c, i) { c.order = i; });

        saveCategories(full);
        renderCategoryTable();
        showToast('Category reordered', 'success');
    }

    /* ------------------------------------------------------------------
       CATEGORY FORM (add / edit)
    ------------------------------------------------------------------ */
    function iconPickerHtml(selectedIcon) {
        var html = '<div class="icon-picker" id="catIconPicker">';
        CATEGORY_ICONS.forEach(function (icon) {
            var isSel = icon === selectedIcon;
            html += '<button type="button" class="icon-picker__item' + (isSel ? ' is-selected' : '') + '" data-icon="' + icon + '" title="' + icon + '">' +
                '<i class="fa-solid ' + icon + '" aria-hidden="true"></i></button>';
        });
        html += '</div>';
        return html;
    }

    function colorPickerHtml(selectedColor) {
        var color = selectedColor || CATEGORY_COLORS[0];
        var html = '<div class="color-picker" id="catColorPicker">';
        CATEGORY_COLORS.forEach(function (c) {
            var isSel = c.toUpperCase() === color.toUpperCase();
            html += '<button type="button" class="color-picker__swatch' + (isSel ? ' is-selected' : '') + '" data-color="' + c + '" style="background:' + c + ';" aria-label="' + c + '"></button>';
        });
        html += '</div>';
        html += '<input type="color" id="pfColorCustom" value="' + color + '" title="Custom color">';
        return html;
    }

    function openCategoryForm(idToEdit) {
        var categories = getCategories();
        var cat = idToEdit ? categories.find(function (c) { return c.id === idToEdit; }) : null;
        var isEdit = !!cat;
        var color = cat ? (cat.color || '#0d6efd') : CATEGORY_COLORS[0];
        var icon = cat ? (cat.icon || 'fa-tag') : 'fa-boxes-stacked';
        var dept = cat ? cat.department : (currentDept !== 'All' ? currentDept : 'Both');
        // Categories are shared lists, so allow a plain label or "Both"
        var deptOptions = ['UCC', 'PUCC', 'Both'].map(function (d) {
            var sel = d === dept ? ' selected' : '';
            return '<option value="' + escapeHtml(d) + '"' + sel + '>' + escapeHtml(d) + '</option>';
        }).join('');

        var formHtml =
            '<form id="categoryForm" class="form-grid" novalidate>' +
            '<div class="form-field form-field--full">' +
            '  <label for="cfName">Category Name</label>' +
            '  <input type="text" id="cfName" required maxlength="40" placeholder="e.g. Diagnostics" value="' + (cat ? escapeHtml(cat.name) : '') + '">' +
            '  <div class="form-error" id="cfError"></div>' +
            '</div>' +
            '<div class="form-field">' +
            '  <label for="cfDept">Department</label>' +
            '  <select id="cfDept">' + deptOptions + '</select>' +
            '</div>' +
            '<div class="form-field form-field--full">' +
            '  <label>Icon</label>' +
            iconPickerHtml(icon) +
            '</div>' +
            '<div class="form-field form-field--full">' +
            '  <label>Color</label>' +
            colorPickerHtml(color) +
            '</div>' +
            '</form>';

        openDialog({
            title: isEdit ? 'Edit Category' : 'Add Category',
            body: formHtml,
            size: 'md',
            closable: true,
            buttons: [
                { label: 'Cancel', className: 'btn btn-outline' },
                {
                    label: isEdit ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Save Changes' : '<i class="fa-solid fa-plus" aria-hidden="true"></i> Add Category',
                    className: 'btn btn-primary',
                    keepOpen: true,
                    onClick: function () { saveCategoryFromForm(idToEdit); }
                }
            ]
        });

        // Wire icon picker
        var picker = document.getElementById('catIconPicker');
        if (picker) {
            picker.addEventListener('click', function (e) {
                var btn = e.target.closest('.icon-picker__item');
                if (!btn) return;
                Array.prototype.forEach.call(picker.querySelectorAll('.is-selected'), function (el) {
                    el.classList.remove('is-selected');
                });
                btn.classList.add('is-selected');
            });
        }

        // Wire color picker
        var colorPicker = document.getElementById('catColorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('click', function (e) {
                var sw = e.target.closest('.color-picker__swatch');
                if (!sw) return;
                Array.prototype.forEach.call(colorPicker.querySelectorAll('.is-selected'), function (el) {
                    el.classList.remove('is-selected');
                });
                sw.classList.add('is-selected');
                var custom = document.getElementById('pfColorCustom');
                if (custom) custom.value = sw.getAttribute('data-color');
            });
            var customInput = document.getElementById('pfColorCustom');
            if (customInput) {
                customInput.addEventListener('input', function () {
                    Array.prototype.forEach.call(colorPicker.querySelectorAll('.is-selected'), function (el) {
                        el.classList.remove('is-selected');
                    });
                });
            }
        }
    }

    function saveCategoryFromForm(idToEdit) {
        var nameEl = document.getElementById('cfName');
        var errEl = document.getElementById('cfError');
        var name = (nameEl.value || '').trim();

        if (!name) { showFieldError(errEl, 'Category name is required.'); nameEl.focus(); return; }

        var categories = getCategories();
        // Unique name check (excluding the one being edited)
        var dup = categories.some(function (c) {
            return c.id !== idToEdit && c.name.toLowerCase() === name.toLowerCase();
        });
        if (dup) { showFieldError(errEl, 'A category named "' + name + '" already exists.'); nameEl.focus(); return; }

        var icon = 'fa-tag';
        var picker = document.getElementById('catIconPicker');
        if (picker) {
            var selected = picker.querySelector('.icon-picker__item.is-selected');
            if (selected) icon = selected.getAttribute('data-icon');
        }

        var color = '#0d6efd';
        var colorPicker = document.getElementById('catColorPicker');
        if (colorPicker) {
            var selSwatch = colorPicker.querySelector('.color-picker__swatch.is-selected');
            color = selSwatch ? selSwatch.getAttribute('data-color') : null;
        }
        var customInput = document.getElementById('pfColorCustom');
        if (customInput && customInput.value) color = customInput.value;

        var list = getCategories();
        var products = getProducts();
        var deptEl = document.getElementById('cfDept');
        var department = deptEl && deptEl.value ? deptEl.value : 'UCC';
        if (department !== 'UCC' && department !== 'PUCC' && department !== 'Both') department = 'UCC';

        if (idToEdit) {
            var existing = list.find(function (c) { return c.id === idToEdit; });
            if (existing) {
                var oldName = existing.name;
                existing.name = name;
                existing.icon = icon;
                existing.color = color;
                existing.department = department;
                // Rename re-assigns all products that used the old category name
                if (oldName !== name) {
                    products = products.map(function (p) {
                        return p.category === oldName ? Object.assign({}, p, { category: name }) : p;
                    });
                }
                // Department move re-assigns product departments too
                products = products.map(function (p) {
                    return p.category === name ? Object.assign({}, p, { department: department }) : p;
                });
            }
        } else {
            var baseId = categoryIdFromName(name);
            var newId = baseId;
            var n = 2;
            while (list.some(function (c) { return c.id === newId; })) {
                newId = baseId + '-' + n;
                n++;
            }
            list.push({
                id: newId,
                name: name,
                icon: icon,
                color: color,
                department: department,
                order: getCategories().length
            });
        }

        saveCategories(list);
        saveProducts(products);
        renderCategoryTable();
        renderProductTable();
        renderOverview();
        showToast(idToEdit ? 'Category updated' : 'Category added', 'success');

        if (window.__lastDialog) window.__lastDialog.close();
    }

    /* ------------------------------------------------------------------
       CATEGORY DELETE
    ------------------------------------------------------------------ */
    function confirmDeleteCategory(id) {
        var categories = getCategories();
        var cat = categories.find(function (c) { return c.id === id; });
        if (!cat) return;
        var count = getProducts().filter(function (p) { return p.category === cat.name; }).length;

        var moveNote = count && categories.length > 1
            ? '<p style="font-size:13px;color:var(--muted);margin-top:8px;">' + count + ' product' + (count === 1 ? '' : 's') + ' in this category will be moved to the first remaining category.</p>'
            : '';

        openDialog({
            title: 'Delete Category',
            body:
                '<p>Are you sure you want to delete <strong>' + escapeHtml(cat.name) + '</strong>?</p>' +
                moveNote,
            size: 'sm',
            closable: true,
            buttons: [
                { label: 'Cancel', className: 'btn btn-outline' },
                { label: '<i class="fa-solid fa-trash" aria-hidden="true"></i> Delete', className: 'btn btn-danger', onClick: function () { deleteCategory(id); } }
            ]
        });
    }

    function deleteCategory(id) {
        var list = getCategories();
        var cat = list.find(function (c) { return c.id === id; });
        if (!cat) return;

        var remaining = list.filter(function (c) { return c.id !== id; });
        if (!remaining.length) {
            showToast('At least one category is required', 'error');
            return;
        }

        var products = getProducts();
        var target = remaining[0].name;
        products = products.map(function (p) {
            return p.category === cat.name ? Object.assign({}, p, { category: target }) : p;
        });

        saveCategories(remaining);
        saveProducts(products);
        renderCategoryTable();
        renderProductTable();
        renderOverview();
        showToast('Category deleted', 'success');
    }

    /* ------------------------------------------------------------------
       SHARE SHOP LINK
    ------------------------------------------------------------------ */
    function renderShareBox() {
        var input = document.getElementById('shareLinkInput');
        var statusEl = document.getElementById('shareLinkStatus');
        var qrImg  = document.getElementById('shareQrImg');
        var qrWrap = document.getElementById('shareQrWrap');

        function hostIsLoopback() {
            var host = (window.location && window.location.hostname) || '';
            return !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
        }

        function fromLocation() {
            var url = window.location.href;
            url = url.split('#')[0];
            return url.replace(/[^/]*$/, 'index.html');
        }

        function updateQr(url) {
            if (!qrImg || !url) return;
            var encoded = encodeURIComponent(url);
            qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encoded;
            if (qrWrap) qrWrap.classList.add('has-qr');
        }

        function upgradeInput(url) {
            if (input) input.value = url;
            updateQr(url);
        }

        // Start with the current address
        upgradeInput(fromLocation());

        var apiUrl = getSyncApiUrl();
        if (!apiUrl) {
            // No server (file://) — show the disk-opened message
            if (statusEl) {
                statusEl.innerHTML =
                    '<i class="fa-solid fa-circle-info" aria-hidden="true" style="color:#0d6efd;"></i> ' +
                    'Serving is off. Start it with <code>node server.js</code> so phones/tablets can open the site and orders sync.';
            }
            return;
        }

        var metaUrl = apiUrl.replace(/\/api\/orders$/, '/api/meta');
        fetch(metaUrl).then(function (r) {
            if (!r.ok) throw new Error('meta http ' + r.status);
            return r.json();
        }).then(function (meta) {
            var upgraded = false;
            var publicLink = meta && meta.shareUrl && /\.trycloudflare\.com/.test(meta.shareUrl);
            if (meta && meta.shareUrl && hostIsLoopback()) {
                upgradeInput(meta.shareUrl + '/index.html');
                upgraded = true;
            }
            if (statusEl) {
                if (upgraded && publicLink) {
                    statusEl.innerHTML =
                        '<i class="fa-solid fa-circle-check" aria-hidden="true" style="color:#12b886;"></i> ' +
                        'Public — open <code>' + escapeHtml(input ? input.value : '') + '</code> anywhere in the world (no Wi-Fi needed). ' +
                        'Screenshot or save the QR code to share.';
                } else if (upgraded) {
                    statusEl.innerHTML =
                        '<i class="fa-solid fa-circle-check" aria-hidden="true" style="color:#12b886;"></i> ' +
                        'Live on this Wi-Fi — open <code>' + escapeHtml(input ? input.value : '') + '</code> in Safari (iPhone) or Chrome (Android). ' +
                        'Screenshot or save the QR code to share.';
                } else {
                    statusEl.innerHTML =
                        '<i class="fa-solid fa-circle-check" aria-hidden="true" style="color:#12b886;"></i> ' +
                        'Sync active — orders placed via this link appear in the dashboard automatically.';
                }
            }
        }).catch(function () {
            if (statusEl) {
                if (syncEnabled()) {
                    statusEl.innerHTML =
                        '<i class="fa-solid fa-circle-info" aria-hidden="true" style="color:#0d6efd;"></i> ' +
                        'Opened on the hosting computer — link uses the current address.';
                } else {
                    statusEl.innerHTML =
                        '<i class="fa-solid fa-circle-info" aria-hidden="true" style="color:#0d6efd;"></i> ' +
                        'Serving is off. Start it with <code>node server.js</code> so phones can open the site.';
                }
            }
        });
    }

    function downloadQr() {
        var img = document.getElementById('shareQrImg');
        var input = document.getElementById('shareLinkInput');
        if (!img || !img.src) return;

        function trigger(url, filename) {
            var a = document.createElement('a');
            a.href = url;
            a.download = filename || 'peh-medical-supply-qr.png';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        // Prefer the native blob download so the filename is kept
        fetch(img.src).then(function (r) { return r.blob(); }).then(function (blob) {
            var url = URL.createObjectURL(blob);
            trigger(url, 'shop-qr-code.png');
            setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
        }).catch(function () {
            // Cross-origin / offline — open the image directly in a new tab
            trigger(img.src, 'shop-qr-code.png');
        });
    }

    function copyShareLink() {
        var input = document.getElementById('shareLinkInput');
        if (!input || !input.value) return;
        var url = input.value;
        function done() { showToast('Share link copied', 'success'); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
        } else {
            input.select();
            fallbackCopy(url);
            done();
        }
    }

    function shareShopLink() {
        var input = document.getElementById('shareLinkInput');
        if (!input || !input.value) return;
        var url = input.value;

        // Use the native share sheet on phones/tablets (Android, iOS)
        if (navigator.share) {
            navigator.share({
                title: 'PEH Medical Supply',
                text: 'Open the hospital supply shop and place your orders',
                url: url
            }).then(function () {
                showToast('Shared', 'success');
            }).catch(function (err) {
                // User cancelled or share failed — fall back to copy
                if (err && err.name === 'AbortError') return;
                copyShareLink();
            });
            return;
        }

        // Desktop / unsupported browsers: copy to clipboard
        copyShareLink();
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
    }

    /* ------------------------------------------------------------------
       RENDER: ORDER HISTORY (admin)
    ------------------------------------------------------------------ */
    var lastOrdersSync = null;

    function renderOrdersSyncNote() {
        var el = document.getElementById('ordersSyncNote');
        if (!el) return;
        if (!syncEnabled()) {
            el.textContent = 'Offline mode — orders are kept in this browser only';
            return;
        }
        el.textContent = lastOrdersSync
            ? 'Last synced ' + lastOrdersSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · server inbox'
            : 'Checking server inbox…';
    }

    function syncAdminOrders(cb) {
        refreshOrdersFromRemote(function () {
            lastOrdersSync = new Date();
            renderOrdersSyncNote();
            if (cb) cb();
        });
    }

    function renderAdminOrders() {
        var wrap = document.getElementById('adminOrdersWrap');
        if (!wrap) return;

        var orders = getOrders();
        orders.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });

        // Filter by department: an order "belongs" to a department if any
        // of its items can be resolved to a product in that department.
        if (activeDept()) {
            var allProducts = getProducts();
            orders = orders.filter(function (o) {
                return (o.items || []).some(function (item) {
                    var p = allProducts.find(function (pp) { return pp.code === item.code; });
                    return p && (p.department === currentDept || p.department === 'Both' || p.department === 'All');
                });
            });
        }

        if (!orders.length) {
            wrap.innerHTML = emptyState(
                'fa-clock-rotate-left',
                'No submitted orders yet',
                'Orders placed by staff will appear here.'
            );
            return;
        }

        var rows = orders.map(function (o) {
            var totalItems = (o.items || []).reduce(function (s, i) { return s + (parseInt(i.quantity, 10) || 0); }, 0);
            var lineCount = (o.items || []).length;
            return '<tr data-order-id="' + escapeHtml(o.orderId) + '">' +
                '<td><strong>' + escapeHtml(o.orderId) + '</strong></td>' +
                '<td>' + formatDate(o.date) + '</td>' +
                '<td>' + escapeHtml(o.time) + '</td>' +
                '<td class="num">' + lineCount + '</td>' +
                '<td class="num">' + totalItems + '</td>' +
                '<td><span class="badge badge--' + (o.status || '').toLowerCase().replace(/\s+/g, '-') + '">' + escapeHtml(o.status) + '</span></td>' +
                '<td class="num">' +
                '  <button class="btn btn-outline btn-sm view-admin-order-btn" style="margin-right:4px;"><i class="fa-solid fa-eye" aria-hidden="true"></i></button>' +
                '  <button class="btn btn-ghost btn-sm icon-btn--danger delete-order-btn"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
                '</td>' +
                '</tr>';
        }).join('');

        wrap.innerHTML =
            '<table class="table"><thead><tr><th>Order No</th><th>Date</th><th>Time</th><th class="num">Lines</th><th class="num">Items</th><th>Status</th><th class="num">Actions</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>';

        renderOrdersSyncNote();

        wrap.addEventListener('click', function (e) {
            var viewBtn = e.target.closest('.view-admin-order-btn');
            var deleteBtn = e.target.closest('.delete-order-btn');
            if (deleteBtn) {
                var delRow = deleteBtn.closest('tr');
                var delId = delRow ? delRow.getAttribute('data-order-id') : null;
                if (!delId) return;
                var order = getOrder(delId);
                deleteOrder(delId);
                renderAdminOrders();
                renderOverview();
                if (order) {
                    var items = (order.items || []).reduce(function (s, i) { return s + (parseInt(i.quantity, 10) || 0); }, 0);
                    showToast(delId + ' deleted', 'success', 'Undo', function () {
                        if (order) saveOrder(order);
                        syncAdminOrders(function () { renderAdminOrders(); renderOverview(); });
                        showToast(delId + ' restored', 'success');
                    });
                }
                return;
            }
            if (!viewBtn) return;
            var row = viewBtn.closest('tr');
            if (!row) return;
            var orderId = row.getAttribute('data-order-id');
            var order = getOrder(orderId);
            if (!order) { showToast('Order not found', 'error'); return; }
            var totalItems = (order.items || []).reduce(function (s, i) { return s + (parseInt(i.quantity, 10) || 0); }, 0);
            var detailHtml =
                '<div class="order-detail-meta">' +
                '  <div><b>Order:</b> ' + escapeHtml(order.orderId) + '</div>' +
                '  <div><b>Date:</b> ' + formatDate(order.date) + ' at ' + escapeHtml(order.time) + '</div>' +
                '  <div><b>Status:</b> <span class="badge badge--' + (order.status || '').toLowerCase().replace(/\s+/g, '-') + '">' + escapeHtml(order.status) + '</span></div>' +
                '  <div><b>Items:</b> ' + totalItems + '</div>' +
                '</div>';
            order.items.forEach(function (it) {
                detailHtml +=
                    '<div class="order-item">' +
                    '  <div class="order-item__code">' + escapeHtml(it.code) + '</div>' +
                    '  <div class="order-item__name">' + escapeHtml(it.name) + '</div>' +
                    '  <div class="order-item__qty"><span class="badge badge--plain">Qty ' + parseInt(it.quantity, 10) + '</span></div>' +
                    '</div>';
            });
            openDialog({
                title: 'Order Details',
                body: detailHtml,
                size: 'lg',
                closable: true,
                buttons: [{ label: 'Close', className: 'btn btn-primary' }]
            });
        });
    }

    /* ------------------------------------------------------------------
       RENDER: CHARTS
    ------------------------------------------------------------------ */
    function renderCharts() {
        var result = computeWeeklyDemand(analyticsRange);

        // Update range toggle
        var toggle = document.getElementById('analyticsRangeToggle');
        if (toggle) {
            Array.prototype.forEach.call(toggle.querySelectorAll('button'), function (b) {
                b.classList.toggle('is-active', b.getAttribute('data-range') === analyticsRange);
            });
        }

        var emptyEl = document.getElementById('chartEmpty');
        if (emptyEl) emptyEl.innerHTML = '';

        // Guard: Chart.js may fail to load (e.g. offline CDN)
        if (typeof window.Chart === 'undefined') {
            if (emptyEl) {
                emptyEl.innerHTML = emptyState(
                    'fa-chart-pie',
                    'Charts unavailable',
                    'Chart.js could not be loaded from the CDN. Charts need an internet connection; weekly demand data still works.'
                );
            }
            return;
        }

        if (!result.rows.length) {
            // Destroy any existing charts
            if (topChart) { topChart.destroy(); topChart = null; }
            if (catChart) { catChart.destroy(); catChart = null; }
            if (emptyEl) {
                emptyEl.innerHTML = emptyState(
                    'fa-chart-pie',
                    'No data to chart',
                    'Submit orders so demand data appears here.'
                );
            }
            return;
        }

        // Top 10 products
        var top10 = result.rows.slice(0, 10);
        var topLabels = top10.map(function (r) { return r.code + ' — ' + r.name; });
        var topValues = top10.map(function (r) { return r.total; });

        // Category totals
        var catMap = {};
        result.rows.forEach(function (r) {
            var cat = r.category || 'Unknown';
            catMap[cat] = (catMap[cat] || 0) + r.total;
        });
        var catLabels = Object.keys(catMap);
        catLabels.sort(function (a, b) { return catMap[b] - catMap[a]; });
        var catValues = catLabels.map(function (c) { return catMap[c]; });

        // Color palette
        var palette = ['#0d6efd', '#12b886', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b', '#f97316', '#84cc16'];

        // Top products bar chart
        var topCtx = document.getElementById('topProductsChart');
        if (topCtx) {
            if (topChart) topChart.destroy();
            topChart = new Chart(topCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: topLabels,
                    datasets: [{
                        label: 'Total Units Ordered',
                        data: topValues,
                        backgroundColor: palette,
                        borderRadius: 6,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#eef2f7' } },
                        x: {
                            grid: { display: false },
                            ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 20 }
                        }
                    }
                }
            });
        }

        // Category doughnut chart
        var catCtx = document.getElementById('categoryChart');
        if (catCtx) {
            if (catChart) catChart.destroy();
            catChart = new Chart(catCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: catLabels,
                    datasets: [{
                        data: catValues,
                        backgroundColor: palette.slice(0, catLabels.length),
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { font: { size: 12 }, padding: 12, usePointStyle: true, pointStyleWidth: 10 }
                        }
                    }
                }
            });
        }
    }

    /* ------------------------------------------------------------------
       TABS
    ------------------------------------------------------------------ */
    function switchSection(name) {
        // Sidebar buttons
        Array.prototype.forEach.call(
            document.querySelectorAll('#adminShell .admin-sidebar button'),
            function (b) { b.classList.toggle('is-active', b.getAttribute('data-section') === name); }
        );
        // Sections
        Array.prototype.forEach.call(
            document.querySelectorAll('.admin-section'),
            function (s) { s.classList.toggle('is-visible', s.id === 'section-' + name); }
        );

        // Lazy render specific sections when first shown
        if (name === 'overview') {
            syncAdminOrders(function () { renderOverview(); renderShareBox(); });
        }
        if (name === 'weekly') renderWeeklyDemand();
        if (name === 'analytics') renderCharts();
        if (name === 'orders') {
            syncAdminOrders(function () {
                renderAdminOrders();
                renderOverview();
            });
        }
        if (name === 'products') renderProductTable();
        if (name === 'categories') renderCategoryTable();
    }

    /* ------------------------------------------------------------------
       LOGIN / LOGOUT
    ------------------------------------------------------------------ */
    function isLoggedIn() {
        return window.readStore(MSM_KEYS.adminSession, false) === true;
    }

    function login(user, pass) {
        // FUTURE: Replace with real auth (Firebase Auth / Supabase Auth).
        if (user === 'admin' && pass === 'admin123') {
            window.writeStore(MSM_KEYS.adminSession, true);
            return true;
        }
        return false;
    }

    function serverLogout() {
        // Clear the server-side HttpOnly cookie so the gate asks again.
        try {
            fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
                credentials: 'same-origin'
            }).catch(function () { /* offline/demo: ignore */ });
        } catch (e) { /* ignore */ }
    }

    function logout() {
        window.writeStore(MSM_KEYS.adminSession, false);
        serverLogout();
        document.getElementById('adminLogin').removeAttribute('hidden');
        document.getElementById('adminDashboard').setAttribute('hidden', '');
        document.getElementById('adminShell').setAttribute('hidden', '');
    }

    /* ------------------------------------------------------------------
       INIT
    ------------------------------------------------------------------ */
    function initAdmin() {
        var loginSection = document.getElementById('adminLogin');
        var dashboardSection = document.getElementById('adminDashboard');
        var shellEl = document.getElementById('adminShell');
        var loadingEl = document.getElementById('adminLoading');

        // Guard: this code only runs on admin.html
        if (!loginSection && !dashboardSection) return;

        if (isLoggedIn() || window.__SERVER_AUTH__ === true) {
            // Server already verified the password (HttpOnly cookie), so jump
            // straight to the dashboard on this load.
            window.writeStore(MSM_KEYS.adminSession, true);
            loginSection.setAttribute('hidden', '');
            dashboardSection.removeAttribute('hidden');
            renderDeptTabs();
            showDashboard();
            // Deep-link: admin.html#products etc. (opened from the left rail)
            var target = (location.hash || '').replace('#', '');
            var valid = ['overview', 'weekly', 'products', 'categories', 'orders', 'analytics'].indexOf(target) !== -1;
            if (valid) switchSection(target);
        } else {
            dashboardSection.setAttribute('hidden', '');
            loginSection.removeAttribute('hidden');
            loadingEl.setAttribute('hidden', '');
            shellEl.setAttribute('hidden', '');
        }

        // Login form
        var form = document.getElementById('loginForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var user = (document.getElementById('loginUser').value || '').trim();
                var pass = document.getElementById('loginPass').value || '';
                var errEl = document.getElementById('loginError');
                if (login(user, pass)) {
                    if (errEl) errEl.textContent = '';
                    loginSection.setAttribute('hidden', '');
                    dashboardSection.removeAttribute('hidden');
                    renderDeptTabs();
                    showDashboard();
                } else {
                    if (errEl) errEl.textContent = 'Invalid credentials. Please try again.';
                }
            });
        }

        // Logout button
        var logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', logout);

        // Refresh orders from the server inbox
        var refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
        if (refreshOrdersBtn) {
            refreshOrdersBtn.addEventListener('click', function () {
                showToast('Checking for new orders…', 'info');
                renderOrdersSyncNote();
                syncAdminOrders(function () {
                    renderAdminOrders();
                    renderOverview();
                });
            });
        }

        // Clear all order history
        var clearAllBtn = document.getElementById('clearAllOrdersBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', function () {
                var count = getOrders().length;
                if (!count) { showToast('No orders to clear', 'info'); return; }
                openDialog({
                    title: 'Clear Order History',
                    body: '<p>Delete all <strong>' + count + '</strong> orders from history?</p>' +
                          '<p style="font-size:13px;color:var(--muted);margin-top:8px;">This can be undone with the Undo button.</p>',
                    size: 'sm',
                    closable: true,
                    buttons: [
                        { label: 'Cancel', className: 'btn btn-outline' },
                        {
                            label: '<i class="fa-solid fa-trash" aria-hidden="true"></i> Clear All',
                            className: 'btn btn-danger',
                            onClick: function () {
                                var prev = clearAllOrders();
                                renderAdminOrders();
                                renderOverview();
                                showToast('All orders cleared', 'success', 'Undo', function () {
                                    prev.forEach(function (o) { saveOrder(o); });
                                    syncAdminOrders(function () { renderAdminOrders(); renderOverview(); });
                                    showToast('Orders restored', 'success');
                                });
                            }
                        }
                    ]
                });
            });
        }

        // Tab buttons
        Array.prototype.forEach.call(
            document.querySelectorAll('#adminShell .admin-sidebar button'),
            function (btn) {
                btn.addEventListener('click', function () {
                    switchSection(btn.getAttribute('data-section'));
                });
            }
        );

        // Weekly range toggle
        var rangeToggle = document.getElementById('rangeToggle');
        if (rangeToggle) {
            rangeToggle.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-range]');
                if (!btn) return;
                adminRange = btn.getAttribute('data-range');
                renderWeeklyDemand();
            });
        }

        // Analytics range toggle
        var analyticsToggle = document.getElementById('analyticsRangeToggle');
        if (analyticsToggle) {
            analyticsToggle.addEventListener('click', function (e) {
                var btn = e.target.closest('button[data-range]');
                if (!btn) return;
                analyticsRange = btn.getAttribute('data-range');
                renderCharts();
            });
        }

        // Add product button
        var addBtn = document.getElementById('addProductBtn');
        if (addBtn) addBtn.addEventListener('click', function () { openProductForm(null); });

        // Product search: re-render the table as you type
        var pSearch = document.getElementById('productSearch');
        if (pSearch) {
            pSearch.addEventListener('input', function () { renderProductTable(); });
        }
        var pSearchClear = document.getElementById('productSearchClear');
        if (pSearchClear) {
            pSearchClear.addEventListener('click', function () {
                if (pSearch) pSearch.value = '';
                renderProductTable();
            });
        }

        // Inline product row editing: Enter saves, Escape cancels
        var pBody = document.getElementById('productTableBody');
        if (pBody) {
            pBody.addEventListener('keydown', function (e) {
                if (!productEditCode) return;
                if (e.key === 'Enter') { e.preventDefault(); saveInlineEdit(); }
                else if (e.key === 'Escape') { e.preventDefault(); productEditCode = null; renderProductTable(); }
            });
            // Single delegated handler for all product row actions (one click per action)
            pBody.addEventListener('click', function (e) {
                var editBtn = e.target.closest('.edit-btn');
                var delBtn = e.target.closest('.del-btn');
                var saveBtn = e.target.closest('.row-save-btn');
                var cancelBtn = e.target.closest('.row-cancel-btn');
                if (editBtn) startInlineEdit(editBtn.getAttribute('data-code'));
                else if (delBtn) deleteProduct(delBtn.getAttribute('data-code'));
                else if (saveBtn) saveInlineEdit();
                else if (cancelBtn) { productEditCode = null; renderProductTable(); }
            });
        }

        // Category table: actions + drag-to-reorder (bound once, never duplicated)
        var catBody = document.getElementById('categoryTableBody');
        if (catBody) {
            catBody.addEventListener('click', function (e) {
                var moveBtn = e.target.closest('.cat-move-btn');
                var editBtn = e.target.closest('.cat-edit-btn');
                var delBtn = e.target.closest('.cat-del-btn');
                if (moveBtn) moveCategory(moveBtn.getAttribute('data-id'), parseInt(moveBtn.getAttribute('data-dir'), 10));
                else if (editBtn) openCategoryForm(editBtn.getAttribute('data-id'));
                else if (delBtn) confirmDeleteCategory(delBtn.getAttribute('data-id'));
            });
            catBody.addEventListener('dragstart', function (e) {
                var row = e.target.closest('tr[data-cat-id]');
                if (!row) return;
                catDragId = row.getAttribute('data-cat-id');
                e.dataTransfer.setData('text/plain', catDragId);
                e.dataTransfer.effectAllowed = 'move';
                row.classList.add('is-dragging');
            });
            catBody.addEventListener('dragend', function (e) {
                catDragId = null;
                clearCatDragClasses();
                var row = e.target.closest('tr[data-cat-id]');
                if (row) row.classList.remove('is-dragging');
            });
            catBody.addEventListener('dragover', function (e) {
                if (!catDragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                var row = e.target.closest('tr[data-cat-id]');
                clearCatDragClasses();
                if (!row || row.getAttribute('data-cat-id') === catDragId) return;
                var rect = row.getBoundingClientRect();
                var before = e.clientY < rect.top + rect.height / 2;
                row.classList.add(before ? 'drag-drop-before' : 'drag-drop-after');
            });
            catBody.addEventListener('drop', function (e) {
                if (!catDragId) return;
                e.preventDefault();
                var row = e.target.closest('tr[data-cat-id]');
                clearCatDragClasses();
                if (row) row.classList.remove('is-dragging');
                if (!row) return;
                var targetId = row.getAttribute('data-cat-id');
                if (targetId === catDragId) return;
                var rect = row.getBoundingClientRect();
                var before = e.clientY < rect.top + rect.height / 2;
                reorderCategory(catDragId, targetId, before);
                catDragId = null;
            });
        }

        // Drag reorder support: current dragged category id
        var catDragId = null;
        function clearCatDragClasses() {
            Array.prototype.forEach.call(catBody ? catBody.querySelectorAll('.drag-drop-before, .drag-drop-after') : [], function (r) {
                r.classList.remove('drag-drop-before', 'drag-drop-after');
            });
        }

        // Add category button
        var addCatBtn = document.getElementById('addCategoryBtn');
        if (addCatBtn) addCatBtn.addEventListener('click', function () { openCategoryForm(null); });

        // Copy share link
        var copyBtn = document.getElementById('copyShareLinkBtn');
        if (copyBtn) copyBtn.addEventListener('click', copyShareLink);

        // Native share (mobile)
        var shareBtn = document.getElementById('shareLinkBtn');
        if (shareBtn) shareBtn.addEventListener('click', shareShopLink);

        // Download QR image
        var qrBtn = document.getElementById('downloadQrBtn');
        if (qrBtn) qrBtn.addEventListener('click', downloadQr);
    }

    function showDashboard() {
        var welcome = document.getElementById('adminWelcome');
        var shell = document.getElementById('adminShell');
        var loading = document.getElementById('adminLoading');
        if (welcome) welcome.textContent = 'Welcome, administrator — ' + new Date().toLocaleDateString();
        if (loading) loading.setAttribute('hidden', '');
        if (shell) shell.removeAttribute('hidden');
        renderShareBox();

        // Pull orders that customers placed via the share link (silent when
        // sync is unavailable), then render everything.
        syncAdminOrders(function () {
            renderOverview();
            renderWeeklyDemand();
            renderProductTable();
            renderCategoryTable();
            renderAdminOrders();
            renderCharts();
        });

        // Re-render when the shared catalog (admin edits on another tab/device) arrives
        window.addEventListener('msm:catalog', function () {
            if (isLoggedIn()) {
                renderOverview();
                renderProductTable();
                renderCategoryTable();
                renderShareBox();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAdmin);
    } else {
        initAdmin();
    }

    /* Exposed for testing / future module integration */
    window.MSMAdmin = {
        computeWeeklyDemand: computeWeeklyDemand,
        getWeeksForRange: getWeeksForRange,
        weekBounds: weekBounds
    };
})();