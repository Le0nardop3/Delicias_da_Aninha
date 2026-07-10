let orders = [];
let filteredOrders = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function parseSelectedOptions(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function renderItemDetails(item) {
  const options = parseSelectedOptions(item.selected_options);

  const optionsHtml = options.length
    ? `
      <div class="order-item-options">
        ${options.map(option => `
          <span>
            ↳ ${escapeHtml(option.name)}
            ${Number(option.price_adjustment || 0) > 0
              ? ` (+${money(option.price_adjustment)})`
              : ''}
          </span>
        `).join('')}
      </div>
    `
    : '';

  const noteHtml = item.item_note
    ? `
      <div class="order-item-note">
        <strong>Obs. do item:</strong> ${escapeHtml(item.item_note)}
      </div>
    `
    : '';

  const unitPrice = Number(item.unit_price ?? item.price ?? 0);
  const subtotal = unitPrice * Number(item.quantity || 0);

  return `
    <li class="order-item">
      <div class="order-item-main">
        <strong>${Number(item.quantity || 0)}x ${escapeHtml(item.product_name)}</strong>
        ${optionsHtml}
        ${noteHtml}
      </div>

      <strong class="order-item-subtotal">${money(subtotal)}</strong>
    </li>
  `;
}

async function loadOrders() {
  const box = document.getElementById('ordersList');
  if (!box) return;

  const res = await fetch('/api/admin/orders');

  if (!res.ok) {
    box.innerHTML = '<div class="order-empty">Erro ao carregar pedidos.</div>';
    return;
  }

  orders = await res.json();

  if (!orders.length) {
    box.innerHTML = '<div class="order-empty">Nenhum pedido recebido ainda.</div>';
    document.getElementById('ordersCount').textContent = '0';
    return;
  }

  applyFilters();
}

function applyFilters() {
  const term = document.getElementById('searchOrder')?.value.toLowerCase().trim() || '';
  const status = document.getElementById('filterStatus')?.value || '';
  const payment = document.getElementById('filterPayment')?.value || '';
  const startDate = document.getElementById('filterStartDate')?.value || '';
  const endDate = document.getElementById('filterEndDate')?.value || '';

  filteredOrders = orders.filter(order => {
    const orderDate = order.created_at
      ? new Date(order.created_at).toISOString().slice(0, 10)
      : '';

    const itemText = (order.items || [])
      .map(item => {
        const options = parseSelectedOptions(item.selected_options);
        return [
          item.product_name,
          item.item_note,
          ...options.map(option => option.name)
        ].join(' ');
      })
      .join(' ')
      .toLowerCase();

    const matchSearch =
      !term ||
      String(order.id).includes(term) ||
      String(order.customer_name || '').toLowerCase().includes(term) ||
      String(order.customer_phone || '').includes(term) ||
      itemText.includes(term);

    const matchStatus = !status || order.status === status;
    const matchPayment = !payment || order.payment === payment;
    const matchDate =
      (!startDate || orderDate >= startDate) &&
      (!endDate || orderDate <= endDate);

    return matchSearch && matchStatus && matchPayment && matchDate;
  });

  document.getElementById('ordersCount').textContent = filteredOrders.length;

  if (!filteredOrders.length) {
    document.getElementById('ordersList').innerHTML =
      '<div class="order-empty">Nenhum pedido encontrado.</div>';
    return;
  }

  renderOrders();
}

function renderOrders() {
  const box = document.getElementById('ordersList');
  const statuses = ['novo', 'producao', 'finalizado', 'cancelado', 'expirado'];
  let html = '';

  statuses.forEach(status => {
    const ordersByStatus = filteredOrders.filter(order => order.status === status);
    if (!ordersByStatus.length) return;

    html += `<h3 class="status-group">${formatStatus(status)}</h3>`;

    ordersByStatus.forEach(order => {
      const itemsHtml = (order.items || [])
        .map(renderItemDetails)
        .join('');

      html += `
        <div class="order-card payment-${escapeHtml(order.payment_status || 'aguardando_pagamento')}">
          <div class="order-top">
            <div>
              <strong>Pedido #${order.id}</strong><br>
              <small>${formatDateTime(order.created_at)}</small>
            </div>

            <span class="order-status ${escapeHtml(order.status)}">
              ${formatStatus(order.status)}
            </span>
          </div>

          <div class="order-client">
            <strong>Cliente:</strong> ${escapeHtml(order.customer_name || 'Não informado')}
            ${order.customer_phone
              ? `<br><strong>Telefone:</strong> ${escapeHtml(order.customer_phone)}`
              : ''}
            <br><strong>Endereço/Retirada:</strong> ${escapeHtml(order.address || '-')}
            <br><strong>Pagamento:</strong> ${escapeHtml(order.payment || '-')}
            <br><strong>Status do pagamento:</strong>
            <span class="payment-status ${escapeHtml(order.payment_status || 'aguardando_pagamento')}">
              ${formatPaymentStatus(order.payment_status)}
            </span>
            ${order.paid_at
              ? `<br><strong>Pago em:</strong> ${formatDateTime(order.paid_at)}`
              : ''}
            <br><strong>Observação geral:</strong> ${escapeHtml(order.note || '-')}
          </div>

          <ul class="order-items">${itemsHtml}</ul>

          <div class="order-footer">
            <div>
              <strong>Total: ${money(order.total)}</strong>

              <div class="order-buttons">
                <button
                  class="secondary"
                  onclick="reimprimirPedido(${order.id})"
                >
                  Reimprimir ticket
                </button>
              </div>
            </div>

            <select onchange="changeOrderStatus(${order.id}, this.value)">
              <option value="novo" ${order.status === 'novo' ? 'selected' : ''}>Novo</option>
              <option value="producao" ${order.status === 'producao' ? 'selected' : ''}>Em produção</option>
              <option value="finalizado" ${order.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
              <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
              <option value="expirado" ${order.status === 'expirado' ? 'selected' : ''}>Expirado</option>
            </select>
          </div>
        </div>
      `;
    });
  });

  box.innerHTML = html;
}

function formatStatus(status) {
  const map = {
    novo: 'Novo',
    producao: 'Em produção',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
    expirado: 'Expirado'
  };

  return map[status] || status || '-';
}

function formatPaymentStatus(status) {
  const map = {
    pago: 'Pago',
    aguardando_pagamento: 'Aguardando pagamento',
    pagamento_na_entrega: 'Pagamento na entrega',
    pendente: 'Pendente',
    recusado: 'Recusado',
    cancelado: 'Cancelado',
    expirado: 'Pix expirado'
  };

  return map[status] || status || 'Aguardando pagamento';
}

async function changeOrderStatus(id, status) {
  const res = await fetch(`/api/admin/orders/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    alert('Erro ao alterar status do pedido.');
    return;
  }

  await loadOrders();
}

async function reimprimirPedido(id) {
  const confirmar = confirm(`Deseja reimprimir o ticket do pedido #${id}?`);
  if (!confirmar) return;

  try {
    const res = await fetch(`/api/admin/orders/${id}/reprint`, {
      method: 'POST'
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(data.error || 'Erro ao solicitar reimpressão.');
      return;
    }

    alert('Pedido enviado para reimpressão.');
    await loadOrders();

  } catch (error) {
    console.error(error);
    alert('Erro ao solicitar reimpressão.');
  }
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

const money = value =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

document.getElementById('searchOrder')?.addEventListener('input', applyFilters);
document.getElementById('filterStatus')?.addEventListener('change', applyFilters);
document.getElementById('filterPayment')?.addEventListener('change', applyFilters);
document.getElementById('refreshOrdersBtn')?.addEventListener('click', loadOrders);
document.getElementById('filterStartDate')?.addEventListener('change', applyFilters);
document.getElementById('filterEndDate')?.addEventListener('change', applyFilters);

loadOrders();
