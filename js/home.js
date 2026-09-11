/**
 * ============================================================
 *  PEH Medical Supply — js/home.js
 * ------------------------------------------------------------
 *  Home page: hero stats + two department cards (UCC / PUCC).
 *  Clicking a card opens that department's own category page.
 * ============================================================
 */

(function () {
    'use strict';

    var DEPT_META = {
        'UCC':  { icon: 'fa-truck-medical', color: '#0d6efd' },
        'PUCC': { icon: 'fa-heart-pulse',   color: '#7c3aed' }
    };

    function renderHeroStats() {
        var products = getProducts();
        var totalStock = 0;
        products.forEach(function (p) { totalStock += parseInt(p.stock, 10) || 0; });

        var elCategories = document.getElementById('statCategories');
        var elProducts = document.getElementById('statProducts');
        var elStock = document.getElementById('statStock');
        if (elCategories) elCategories.textContent = getCategories().length;
        if (elProducts) elProducts.textContent = products.length;
        if (elStock) elStock.textContent = totalStock.toLocaleString();
    }

    function renderDepartmentCards() {
        var grid = document.getElementById('categoryGrid');
        if (!grid) return;

        var depts = getDepartments();
        if (!depts.length) {
            grid.innerHTML = '<p class="page-loading">No departments configured.</p>';
            return;
        }

        grid.innerHTML = depts.map(function (dept) {
            var meta = DEPT_META[dept] || { icon: 'fa-hospital', color: '#0d6efd' };
            var cats = getCategories(dept);
            var products = getProducts(dept);
            var link = 'department.html?dept=' + encodeURIComponent(dept);

            return '<a class="dept-card" href="' + link + '" style="--cat-accent:' + meta.color + '">' +
                '  <span class="dept-card__icon"><i class="fa-solid ' + meta.icon + '" aria-hidden="true"></i></span>' +
                '  <span class="dept-card__name">' + escapeHtml(dept) + '</span>' +
                '  <span class="dept-card__meta">' + cats.length + ' categories &middot; ' + products.length + ' products</span>' +
                '  <span class="dept-card__action">Browse categories <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>' +
                '</a>';
        }).join('');

        var hint = document.getElementById('categoryHint');
        if (hint) hint.textContent = depts.length + ' departments';
    }

    function initHome() {
        renderHeroStats();
        renderDepartmentCards();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHome);
    } else {
        initHome();
    }

    window.addEventListener('msm:catalog', initHome);
})();