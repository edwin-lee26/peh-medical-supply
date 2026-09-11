/**
 * ============================================================
 *  PEH Medical Supply — js/cart.js
 * ------------------------------------------------------------
 *  Shopping cart page: renders table, handles quantity edits,
 *  clear cart, submit order (with confirm + success modals).
 * ============================================================
 */

(function () {
    'use strict';

    function renderCart() {
        var body = document.getElementById('cartBody');
        if (!body) return;

        var cart = getCart();

        if (!cart.length) {
            body.innerHTML = emptyState(
                'fa-cart-shopping',
                'Your cart is empty',
                'Browse the product catalog and add items to get started.',
                '<a href="products.html" class="btn btn-primary"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i> Browse Products</a>'
            );
            return;
        }

        var totals = getCartTotals();

        var rowsHtml = cart.map(function (item) {
            var p = getProduct(item.code);
            var maxQty = p ? Math.max(parseInt(p.stock, 10) || 1, 1) : 9999;
            return '<tr data-code="' + escapeHtml(item.code) + '">' +
                '<td><strong>' + escapeHtml(item.code) + '</strong></td>' +
                '<td>' + escapeHtml(item.name) + '</td>' +
                '<td>' + escapeHtml(item.unit) + '</td>' +
                '<td>' +
                '  <div class="qty-selector">' +
                '    <button type="button" data-action="minus" aria-label="Decrease quantity">−</button>' +
                '    <input type="number" min="1" max="' + maxQty + '" value="' + item.quantity + '" aria-label="Quantity">' +
                '    <button type="button" data-action="plus" aria-label="Increase quantity">+</button>' +
                '  </div>' +
                '</td>' +
                '<td><button class="btn btn-ghost btn-sm remove-btn"><i class="fa-solid fa-trash" aria-hidden="true"></i> Remove</button></td>' +
                '</tr>';
        }).join('');

        body.innerHTML =
            '<div class="table-wrap">' +
            '<table class="table" id="cartTable">' +
            '<thead><tr><th>Code</th><th>Product Name</th><th>Unit</th><th>Quantity</th><th class="num">Action</th></tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
            '</table></div>' +
            '<div class="cart-summary">' +
            '  <div class="item"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i><div><strong>' + totals.products + '</strong><span>Products</span></div></div>' +
            '  <div class="item"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><div><strong>' + totals.items + '</strong><span>Total Items</span></div></div>' +
            '</div>' +
            '<div class="cart-actions">' +
            '  <button class="btn btn-outline btn-sm" id="clearCartBtn"><i class="fa-solid fa-trash-can" aria-hidden="true"></i> Clear Cart</button>' +
            '  <button class="btn btn-success btn-lg" id="submitOrderBtn"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Submit Order</button>' +
            '</div>';

        bindEvents();
    }

    function bindEvents() {
        // Quantity change via buttons + input
        var table = document.getElementById('cartTable');
        if (table) {
            table.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action]');
                if (btn) {
                    var row = btn.closest('tr');
                    var code = row.getAttribute('data-code');
                    var input = row.querySelector('.qty-selector input');
                    var step = btn.getAttribute('data-action') === 'plus' ? 1 : -1;
                    var max = parseInt(input.getAttribute('max'), 10) || 999;
                    var val = sanitizeQuantity(parseInt(input.value, 10) + step, max);
                    input.value = val;
                    updateCartItemQty(code, val);
                    // Re-render totals without full re-render
                    updateSummary();
                }
            });
            table.addEventListener('change', function (e) {
                if (e.target.closest('.qty-selector input')) {
                    var input = e.target;
                    var row = input.closest('tr');
                    var code = row.getAttribute('data-code');
                    var max = parseInt(input.getAttribute('max'), 10) || 999;
                    var val = sanitizeQuantity(input.value, max);
                    input.value = val;
                    updateCartItemQty(code, val);
                    updateSummary();
                }
            });
        }

        // Remove buttons
        if (table) {
            table.addEventListener('click', function (e) {
                var btn = e.target.closest('.remove-btn');
                if (!btn) return;
                var row = btn.closest('tr');
                var code = row.getAttribute('data-code');
                removeFromCart(code);
                renderCart();
            });
        }

        // Clear cart
        var clearBtn = document.getElementById('clearCartBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                openDialog({
                    title: 'Clear Cart',
                    body: '<p>Are you sure you want to remove all items from your cart?</p>',
                    size: 'sm',
                    buttons: [
                        { label: 'Cancel', className: 'btn btn-outline' },
                        { label: 'Clear All', className: 'btn btn-danger', onClick: function () { clearCart(); renderCart(); } }
                    ]
                });
            });
        }

        // Submit order
        var submitBtn = document.getElementById('submitOrderBtn');
        if (submitBtn) submitBtn.addEventListener('click', confirmSubmit);
    }

    function updateSummary() {
        var totals = getCartTotals();
        var items = document.querySelectorAll('.cart-summary .item');
        // items[0] = products, items[1] = total items
        if (items[1]) {
            var strong = items[1].querySelector('strong');
            if (strong) strong.textContent = totals.items;
        }
    }

    /* ------------------------------------------------------------------
       SUBMIT ORDER FLOW
    ------------------------------------------------------------------ */
    function confirmSubmit() {
        var cart = getCart();
        var totals = getCartTotals();

        openDialog({
            title: 'Confirm Order',
            body:
                '<p>Submit an order with <strong>' + totals.products +
                ' product' + (totals.products === 1 ? '' : 's') +
                '</strong> and <strong>' + totals.items +
                ' total item' + (totals.items === 1 ? '' : 's') +
                '</strong>?</p>' +
                '<p style="margin-top:12px;font-size:13.5px;color:var(--muted);">This action cannot be undone.</p>',
            size: 'sm',
            buttons: [
                { label: 'Cancel', className: 'btn btn-outline' },
                { label: '<i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Submit Order', className: 'btn btn-success', onClick: submitOrder }
            ]
        });
    }

    function submitOrder() {
        var cart = getCart();
        if (!cart.length) return;

        var order = createOrderFromCart(cart);
        saveOrder(order);

        // Sync to the shared inbox (silent; disabled when opened via file://)
        postOrderToInbox(order);

        clearCart();
        refreshCartCount();

        // Show success dialog
        openDialog({
            title: 'Order Submitted Successfully',
            body:
                '<div style="text-align:center;padding:10px 0;">' +
                '  <div style="display:inline-flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;background:#e6f6ec;color:var(--success);font-size:28px;margin-bottom:12px;">' +
                '    <i class="fa-solid fa-circle-check" aria-hidden="true"></i>' +
                '  </div>' +
                '  <p style="font-size:16px;margin-bottom:4px;">Order submitted successfully</p>' +
                '  <p style="font-size:15px;font-weight:700;color:#16233b;margin-bottom:20px;">' + escapeHtml(order.orderId) + '</p>' +
                '  <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
                '    <a href="orders.html?view=' + encodeURIComponent(order.orderId) + '" class="btn btn-primary btn-sm"><i class="fa-solid fa-eye" aria-hidden="true"></i> View Order</a>' +
                '    <a href="index.html" class="btn btn-outline btn-sm"><i class="fa-solid fa-home" aria-hidden="true"></i> Back to Home</a>' +
                '  </div>' +
                '</div>',
            size: 'sm',
            buttons: [],
            closable: true
        });

        renderCart();
    }

    function initCartPage() {
        renderCart();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCartPage);
    } else {
        initCartPage();
    }

    // Re-render when the shared catalog (admin edits) arrives
    window.addEventListener('msm:catalog', renderCart);
})();