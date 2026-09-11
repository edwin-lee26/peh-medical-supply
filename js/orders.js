/**
 * ============================================================
 *  PEH Medical Supply — js/orders.js
 * ------------------------------------------------------------
 *  Order list page: renders past orders, allows viewing details
 *  and printing a specific order. Supports auto-opening an order
 *  via the ?view=ORD-YYYYMMDD-NNN query parameter.
 * ============================================================
 */

(function () {
    'use strict';

    /* ------------------------------------------------------------------
       RENDER ORDER LIST
    ------------------------------------------------------------------ */
    function renderOrders() {
        var body = document.getElementById('ordersBody');
        if (!body) return;

        var orders = getOrders();
        // Show newest first
        orders.sort(function (a, b) {
            return (b.date + b.time).localeCompare(a.date + a.time);
        });

        if (!orders.length) {
            body.innerHTML = emptyState(
                'fa-clipboard-list',
                'No previous orders',
                'When you submit an order, it will appear here.',
                '<a href="products.html" class="btn btn-primary"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Start Shopping</a>'
            );
            return;
        }

        var html = '<div class="order-list">';
        orders.forEach(function (order) {
            var totalItems = (order.items || []).reduce(function (sum, i) { return sum + (parseInt(i.quantity, 10) || 0); }, 0);
            var totalLines = (order.items || []).length;
            var statusClass = (order.status || '').toLowerCase().replace(/\s+/g, '-');

            html +=
                '<div class="order-card" data-order-id="' + escapeHtml(order.orderId) + '">' +
                '  <div class="order-card__main">' +
                '    <div class="order-card__num">' + escapeHtml(order.orderId) + '</div>' +
                '    <div class="order-card__date">' + formatDate(order.date) + '</div>' +
                '    <span class="badge badge--' + statusClass + '">' + escapeHtml(order.status) + '</span>' +
                '  </div>' +
                '  <div class="order-card__stat">' +
                '    <span><strong>' + totalLines + '</strong> line' + (totalLines === 1 ? '' : 's') + '</span>' +
                '    <span><strong>' + totalItems + '</strong> item' + (totalItems === 1 ? '' : 's') + '</span>' +
                '    <button class="btn btn-outline btn-sm view-order-btn"><i class="fa-solid fa-eye" aria-hidden="true"></i> View Order</button>' +
                '  </div>' +
                '</div>';
        });
        html += '</div>';
        body.innerHTML = html;

        // Bind view buttons
        body.addEventListener('click', function (e) {
            var btn = e.target.closest('.view-order-btn');
            if (!btn) return;
            var card = btn.closest('.order-card');
            if (card) openOrderDetail(card.getAttribute('data-order-id'));
        });
    }

    /* ------------------------------------------------------------------
       ORDER DETAIL MODAL (with print area)
    ------------------------------------------------------------------ */
    function openOrderDetail(orderId) {
        var order = getOrder(orderId);
        if (!order) {
            showToast('Order not found: ' + orderId, 'error');
            return;
        }
        var totalItems = (order.items || []).reduce(function (sum, i) { return sum + (parseInt(i.quantity, 10) || 0); }, 0);

        var bodyHtml =
            '<div class="print-area" id="orderPrintArea">' +
            '  <div style="text-align:center;margin-bottom:16px;">' +
            '    <strong style="font-size:17px;">PEH Medical Supply</strong><br>' +
            '    <span style="font-size:12px;color:#666;">Internal Hospital Supply Order</span>' +
            '  </div>' +
            '  <div style="text-align:center;margin-bottom:14px;">' +
            '    <strong style="font-size:15px;">Order: ' + escapeHtml(order.orderId) + '</strong><br>' +
            '    <span style="font-size:13px;">Date: ' + formatDate(order.date) + ' at ' + escapeHtml(order.time) + '</span><br>' +
            '    <span style="font-size:13px;">Status: ' + escapeHtml(order.status) + '</span>' +
            '  </div>' +
            '  <table style="width:100%;border-collapse:collapse;margin-top:10px;">' +
            '    <thead><tr><th style="border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px;">Code</th>' +
            '    <th style="border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px;">Product Name</th>' +
            '    <th style="border:1px solid #ccc;padding:6px 10px;text-align:center;font-size:12px;">Qty</th>' +
            '    <th style="border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px;">Unit</th></tr></thead>' +
            '    <tbody>' +
            order.items.map(function (it) {
                return '<tr>' +
                    '<td style="border:1px solid #ccc;padding:6px 10px;font-family:Consolas,monospace;font-size:13px;">' + escapeHtml(it.code) + '</td>' +
                    '<td style="border:1px solid #ccc;padding:6px 10px;">' + escapeHtml(it.name) + '</td>' +
                    '<td style="border:1px solid #ccc;padding:6px 10px;text-align:center;font-weight:700;">' + parseInt(it.quantity, 10) + '</td>' +
                    '<td style="border:1px solid #ccc;padding:6px 10px;">' + escapeHtml(it.unit) + '</td>' +
                    '</tr>';
            }).join('') +
            '    </tbody>' +
            '  </table>' +
            '  <p style="text-align:right;margin-top:10px;font-size:12px;color:#888;">Printed on ' + formatDate(order.date) + ' · PEH Medical Supply</p>' +
            '</div>' +
            '<div class="order-detail-meta">' +
            '  <div><b>Order:</b> ' + escapeHtml(order.orderId) + '</div>' +
            '  <div><b>Date:</b> ' + formatDate(order.date) + ' at ' + escapeHtml(order.time) + '</div>' +
            '  <div><b>Status:</b> <span class="badge badge--' + (order.status || '').toLowerCase().replace(/\s+/g, '-') + '">' + escapeHtml(order.status) + '</span></div>' +
            '  <div><b>Items:</b> ' + totalItems + '</div>' +
            '</div>';

        order.items.forEach(function (it) {
            bodyHtml +=
                '<div class="order-item">' +
                '  <div class="order-item__code">' + escapeHtml(it.code) + '</div>' +
                '  <div class="order-item__name">' + escapeHtml(it.name) + '</div>' +
                '  <div class="order-item__qty"><span class="badge badge--plain">Qty ' + parseInt(it.quantity, 10) + '</span></div>' +
                '</div>';
        });

        openDialog({
            title: 'Order Details',
            body: bodyHtml,
            size: 'lg',
            closable: true,
            buttons: [
                { label: '<i class="fa-solid fa-print" aria-hidden="true"></i> Print Order', className: 'btn btn-outline', onClick: printOrder },
                { label: 'Close', className: 'btn btn-primary' }
            ]
        });
    }

    /* ------------------------------------------------------------------
       PRINT
    ------------------------------------------------------------------ */
    function printOrder() {
        document.body.classList.add('print-active');
        window.print();
        // Clean up after print dialog is dismissed
        setTimeout(function () {
            document.body.classList.remove('print-active');
        }, 500);
    }

    /* ------------------------------------------------------------------
       INIT
    ------------------------------------------------------------------ */
    function init() {
        // Pull any orders that reached the shared inbox (e.g. placed on
        // another device via the share link), then re-render. This is a
        // silent no-op when sync is disabled (file:// or no endpoint).
        refreshOrdersFromRemote(function () {
            renderOrders();

            // Auto-open order from query param
            var params = getQueryParams();
            var viewId = params.get('view');
            if (viewId) {
                openOrderDetail(viewId);
                // Clean URL without reloading
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, '', window.location.pathname);
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-render order list when the shared catalog (admin edits) arrives
    window.addEventListener('msm:catalog', function () {
        if (typeof renderOrders === 'function') renderOrders();
    });
})();