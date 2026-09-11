/**
 * ============================================================
 *  PEH Medical Supply — js/department.js
 * ------------------------------------------------------------
 *  Department page: shows ONLY the selected department's
 *  categories (UCC or PUCC), each linking to its products.
 * ============================================================
 */

(function () {
    'use strict';

    function getQueryParam(name) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name) || '';
    }

    function currentDepartment() {
        var raw = getQueryParam('dept');
        var depts = getDepartments();
        return depts.indexOf(raw) !== -1 ? raw : (depts[0] || 'UCC');
    }

    function renderDeptPage() {
        var dept = currentDepartment();

        var breadcrumb = document.getElementById('breadcrumbCurrent');
        if (breadcrumb) breadcrumb.textContent = dept;

        var title = document.getElementById('pageTitle');
        if (title) title.textContent = dept + ' Categories';

        var cats = getCategories(dept);
        var products = getProducts(dept);

        var sub = document.getElementById('pageSubtitle');
        if (sub) sub.textContent = cats.length + ' categories &middot; ' + products.length + ' products';

        var grid = document.getElementById('deptCategoryGrid');
        if (!grid) return;

        if (!cats.length) {
            grid.innerHTML = '<p class="page-loading">No categories in this department yet.</p>';
            return;
        }

        grid.innerHTML = cats.map(function (cat) {
            var link = 'products.html?category=' + encodeURIComponent(cat.name) + '&department=' + encodeURIComponent(dept);
            return '<a class="category-card" href="' + link + '" style="--cat-accent:' + (cat.color || '#0d6efd') + '" title="' + escapeHtml(cat.name) + '">' +
                '  <span class="category-card__icon"><i class="fa-solid ' + cat.icon + '" aria-hidden="true"></i></span>' +
                '  <span class="category-card__name">' + escapeHtml(cat.name) + '</span>' +
                '</a>';
        }).join('');
    }

    function init() {
        renderDeptPage();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('msm:catalog', renderDeptPage);
})();