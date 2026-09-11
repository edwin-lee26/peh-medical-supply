/**
 * ============================================================
 *  PEH Medical Supply — js/products.js
 * ------------------------------------------------------------
 *  Category / product list page.
 *  Reads ?category= and ?search= query params, renders a
 *  filtered grid of product cards, and handles add-to-cart.
 * ============================================================
 */

(function () {
    'use strict';

    var currentFilter = { category: '', search: '', department: '' };

    /* ------------------------------------------------------------------
       RENDER
    ------------------------------------------------------------------ */

    function renderPageHeader() {
        var title = document.getElementById('pageTitle');
        var subtitle = document.getElementById('pageSubtitle');
        var crumb = document.getElementById('breadcrumbCurrent');

        if (currentFilter.category) {
            if (title) title.textContent = currentFilter.category;
            if (subtitle) subtitle.textContent = 'All products in this category';
            if (crumb) crumb.textContent = currentFilter.category;
        } else if (currentFilter.search) {
            if (title) title.textContent = 'Search Results';
            if (subtitle) subtitle.textContent = 'Results for "' + currentFilter.search + '"';
            if (crumb) crumb.textContent = 'Search: "' + currentFilter.search + '"';
        } else {
            if (title) title.textContent = 'All Products';
            if (subtitle) subtitle.textContent = 'Browse the full catalog';
            if (crumb) crumb.textContent = 'All Products';
        }
    }

    function filterProducts() {
        var all = getProducts(currentFilter.department || null);
        var q = currentFilter.search.toLowerCase();
        var cat = currentFilter.category;

        var list = all.filter(function (p) {
            var matchCat = cat ? p.category.toLowerCase() === cat.toLowerCase() : true;
            var matchQ = q
                ? (p.code + ' ' + p.name + ' ' + p.description + ' ' + p.category).toLowerCase().indexOf(q) !== -1
                : true;
            return matchCat && matchQ;
        });

        // Sort by code for consistency
        list.sort(function (a, b) { return a.code.localeCompare(b.code); });
        return list;
    }

    function renderGrid() {
        var grid = document.getElementById('productGrid');
        var countEl = document.getElementById('resultCount');
        if (!grid) return;

        var products = filterProducts();

        if (countEl) countEl.textContent = products.length + ' product' + (products.length === 1 ? '' : 's');

        if (!products.length) {
            // Distinguish "category doesn't exist" from "no products match"
            var invalidCategory = currentFilter.category && !getCategory(currentFilter.category);
            grid.innerHTML = emptyState(
                invalidCategory ? 'fa-circle-question' : 'fa-box-open',
                invalidCategory ? 'Category not found' : 'No products found',
                invalidCategory
                    ? '"' + currentFilter.category + '" is not a valid category. Choose one from the home page.'
                    : (currentFilter.search
                        ? 'Try adjusting your search terms.'
                        : (currentFilter.category ? 'There are no products in this category yet.' : 'No products available at the moment.')),
                '<a href="index.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to Home</a>'
            );
            return;
        }

        grid.innerHTML = products.map(function (p) {
            var cat = getCategory(p.category);
            var catColor = cat ? cat.color : '#0d6efd';
            var catIcon = cat ? cat.icon : 'fa-box-open';

            var mediaHtml = p.image
                ? '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" loading="lazy">'
                : '<span class="product-card__media-placeholder"><i class="fa-solid ' + catIcon + '" aria-hidden="true"></i></span>';

            var par = getParLevel(p, currentFilter.department);
            if (isNaN(par)) par = 0;
            var available = parseInt(p.stock, 10) > 0;
            var qtyDisabled = available ? '' : ' disabled';
            var addDisabled = available ? '' : ' disabled';
            var maxQty = Math.max(parseInt(p.stock, 10) || 1, 1);

            return '<article class="product-card" data-code="' + escapeHtml(p.code) + '" style="--cat-accent:' + catColor + '">' +
                '<div class="product-card__media">' + mediaHtml + '</div>' +
                '<div class="product-card__body">' +
                '  <span class="product-card__code">' + escapeHtml(p.code) + '</span>' +
                '  <h3 class="product-card__name">' + escapeHtml(p.name) + '</h3>' +
                '  <p class="product-card__desc">' + escapeHtml(p.description) + '</p>' +
                '  <div class="product-card__meta">' +
                '    <span>Unit: ' + escapeHtml(p.unit) + '</span>' +
                '    <span class="badge badge--' + (available ? 'ok' : 'out') + '">Par ' + par + ' · ' + (available ? 'Available' : 'Finished') + '</span>' +
                '  </div>' +
                (available
                    ? '  <div class="product-card__footer">' +
                      '    <div class="qty-selector">' +
                      '      <button type="button" data-action="minus"' + qtyDisabled + ' aria-label="Decrease quantity">−</button>' +
                      '      <input type="number" min="1" max="' + maxQty + '" value="1" aria-label="Quantity">' +
                      '      <button type="button" data-action="plus"' + qtyDisabled + ' aria-label="Increase quantity">+</button>' +
                      '    </div>' +
                      '    <button class="btn btn-primary btn-sm add-to-cart-btn"' + addDisabled + '>' +
                      '      <i class="fa-solid fa-cart-plus" aria-hidden="true"></i> Add to Cart' +
                      '    </button>' +
                      '  </div>'
                    : '  <div class="product-card__footer"><span style="font-size:13px;color:var(--danger);">Currently unavailable</span></div>'
                ) +
                '</div>' +
                '</article>';
        }).join('');
    }

    /* ------------------------------------------------------------------
       EVENT HANDLERS (delegation)
    ------------------------------------------------------------------ */

    function handleQtyClick(e) {
        var btn = e.target.closest('[data-action]');
        if (!btn) return;
        var sel = btn.closest('.qty-selector');
        var input = sel ? sel.querySelector('input') : null;
        if (!input) return;
        var step = btn.getAttribute('data-action') === 'plus' ? 1 : -1;
        var max = parseInt(input.getAttribute('max'), 10) || 999;
        var val = sanitizeQuantity(parseInt(input.value, 10) + step, max);
        input.value = val;
    }

    function handleAddToCart(e) {
        var btn = e.target.closest('.add-to-cart-btn');
        if (!btn) return;
        var card = btn.closest('.product-card');
        var code = card ? card.getAttribute('data-code') : null;
        if (!code) return;
        var product = getProduct(code);
        if (!product) return;
        var qtyInput = card.querySelector('.qty-selector input');
        var requested = parseInt(qtyInput ? qtyInput.value : 1, 10);
        if (requested > product.stock) {
            showToast('Only ' + product.stock + ' units of ' + product.code + ' in stock.', 'warning');
        }
        var qty = sanitizeQuantity(requested, product.stock);
        addToCart({ code: product.code, name: product.name, unit: product.unit, quantity: qty });
        showToast(product.code + ' added to cart', 'success');
    }

    function handleSearch(e) {
        var q = (e.target.value || '').trim();
        currentFilter.search = q;
        renderGrid();
    }

    function init() {
        var params = getQueryParams();
        currentFilter.category = params.get('category') || '';
        currentFilter.search = params.get('search') || '';
        currentFilter.department = params.get('department') || '';
        renderPageHeader();

        var searchInput = document.getElementById('productSearch');
        if (searchInput) searchInput.value = currentFilter.search;
        renderGrid();

        var grid = document.getElementById('productGrid');
        if (grid) {
            grid.addEventListener('click', function (e) {
                handleQtyClick(e);
                handleAddToCart(e);
            });
            grid.addEventListener('change', function (e) {
                if (e.target.closest('.qty-selector input')) {
                    var input = e.target;
                    var max = parseInt(input.getAttribute('max'), 10) || 999;
                    input.value = sanitizeQuantity(input.value, max);
                }
            });
        }

        if (searchInput) searchInput.addEventListener('input', handleSearch);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-render when the shared catalog (admin edits) arrives
    window.addEventListener('msm:catalog', function () {
        renderPageHeader();
        renderGrid();
    });
})();