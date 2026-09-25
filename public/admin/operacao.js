let orders = [];
let previousAwaitingIds = new Set();
let firstLoad = true;
let soundEnabled = true;
let refreshTimer = null;
let currentView = 'kanban';
let expirationMinutes = 60;

const STATUS = {
  aguardando_whatsapp: {
    label: 'Aguardando WhatsApp',
    next: 'confirmado',
    action: 'Confirmar pedido'
  },
  confirmado: {
    label: 'Confirmado',
    next: 'preparando',
    action: 'Iniciar preparo'
  },
  preparando: {
    label: 'Em preparo',
    next: 'pronto',
    action: 'Marcar como pronto'
  },
  pronto: {
    label: 'Pronto',
    next: 'entregue',
    action: 'Marcar como entregue'
  },
  entregue: { label: 'Entregue' },
  cancelado: { label: 'Cancelado' },
  expirado: { label: 'Expirado' }
};

const COLUMNS = [
  ['aguardando_whatsapp', 'cardsAwaiting', 'columnCountAwaiting'],
  ['confirmado', 'cardsConfirmed', 'columnCountConfirmed'],
  ['preparando', 'cardsPreparing', 'columnCountPreparing'],
  ['pronto', 'cardsReady', 'columnCountReady']
];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function parseOptions(value) {
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

function getStatus(order) {
  return order.operation_status || 'aguardando_whatsapp';
}

function ageMinutes(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function ageLabel(dateValue) {
  const mins = ageMinutes(dateValue);
  if (mins < 1) return 'agora';
  if (mins === 1) return 'há 1 min';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours === 1) return rest ? `há 1h ${rest}min` : 'há 1h';
  return rest ? `há ${hours}h ${rest}min` : `há ${hours}h`;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function deliveryLabel(order) {
  const address = String(order.address || '').trim();
  return address ? '🛵 Entrega' : '🏠 Retirada';
}

function itemCount(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function itemSummaryHtml(order) {
  const items = order.items || [];
  if (!items.length) return '<div class="card-item"><small>Nenhum item encontrado.</small></div>';

  return items.slice(0, 4).map(item => {
    const options = parseOptions(item.selected_options);
    const optionNames = options.map(option => escapeHtml(option.name)).join(', ');
    return `
      <div class="card-item">
        <strong>${Number(item.quantity || 0)}x</strong>
        <span>
          ${escapeHtml(item.product_name)}
          ${optionNames ? `<small>${optionNames}</small>` : ''}
        </span>
      </div>
    `;
  }).join('') + (items.length > 4 ? `<small>+ ${items.length - 4} item(ns)</small>` : '');
}

function nextAction(order) {
  const status = getStatus(order);
  const config = STATUS[status];
  if (!config?.next) return '';
  return `
    <button class="action-main" onclick="event.stopPropagation(); advanceOrder(${Number(order.id)}, '${config.next}')">
      ${config.action}
    </button>
  `;
}

function whatsappLink(order) {
  const phone = String(order.customer_phone || '').replace(/\D/g, '');
  if (!phone) return '';
  const message = `Olá ${order.customer_name || ''}! Sobre o pedido #${order.id} da Delícias da Aninha.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function renderCard(order) {
  const status = getStatus(order);
  const action = nextAction(order);
  const whatsapp = whatsappLink(order);
  const isNew = !firstLoad && status === 'aguardando_whatsapp' && !previousAwaitingIds.has(Number(order.id));

  return `
    <article class="order-card ${isNew ? 'new-arrival' : ''}" onclick="openOrderModal(${Number(order.id)})">
      <div class="card-top">
        <div>
          <div class="order-number">#${Number(order.id)}</div>
          <div class="card-customer">${escapeHtml(order.customer_name || 'Cliente')}</div>
        </div>
        <span class="order-age">${ageLabel(order.created_at)}</span>
      </div>

      <div class="card-meta">
        <span class="meta-chip">${deliveryLabel(order)}</span>
        <span class="meta-chip">${itemCount(order)} ${itemCount(order) === 1 ? 'item' : 'itens'}</span>
        <span class="meta-chip total">${money(order.total)}</span>
      </div>

      <div class="card-items">${itemSummaryHtml(order)}</div>

      ${String(order.address || '').trim()
        ? `<div class="card-address"><strong>📍</strong> ${escapeHtml(order.address)}</div>`
        : ''}

      <div class="card-actions">
        ${action}
        <button class="action-secondary" onclick="event.stopPropagation(); openOrderModal(${Number(order.id)})">Ver pedido</button>
      </div>

      ${whatsapp
        ? `<div class="card-actions" style="margin-top:7px;grid-template-columns:1fr">
            <a class="action-secondary" href="${whatsapp}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬 Falar com cliente</a>
          </div>`
        : ''}
    </article>
  `;
}

function renderKanban() {
  const byStatus = new Map();
  COLUMNS.forEach(([status]) => byStatus.set(status, []));

  orders.forEach(order => {
    const status = getStatus(order);
    if (byStatus.has(status)) byStatus.get(status).push(order);
  });

  COLUMNS.forEach(([status, cardsId, countId]) => {
    const box = document.getElementById(cardsId);
    const list = byStatus.get(status) || [];
    document.getElementById(countId).textContent = list.length;

    box.innerHTML = list.length
      ? list.map(renderCard).join('')
      : '<div class="empty-column">Nenhum pedido nesta etapa.</div>';
  });
}

function renderMetrics() {
  const count = status => orders.filter(order => getStatus(order) === status).length;

  document.getElementById('countAwaiting').textContent = count('aguardando_whatsapp');
  document.getElementById('countConfirmed').textContent = count('confirmado');
  document.getElementById('countPreparing').textContent = count('preparando');
  document.getElementById('countReady').textContent = count('pronto');
}

function renderList() {
  const box = document.getElementById('listOrders');
  const term = document.getElementById('listSearch').value.toLowerCase().trim();
  const statusFilter = document.getElementById('listStatus').value;

  const filtered = orders.filter(order => {
    const text = [
      order.id,
      order.customer_name,
      order.customer_phone,
      ...(order.items || []).map(item => item.product_name)
    ].join(' ').toLowerCase();

    return (!term || text.includes(term))
      && (!statusFilter || getStatus(order) === statusFilter);
  });

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-column">Nenhum pedido encontrado.</div>';
    return;
  }

  box.innerHTML = filtered.map(order => {
    const status = getStatus(order);
    return `
      <div class="list-row">
        <div><strong>#${Number(order.id)}</strong><small>${ageLabel(order.created_at)}</small></div>
        <div><strong>${escapeHtml(order.customer_name || 'Cliente')}</strong><small>${itemCount(order)} itens • ${deliveryLabel(order)}</small></div>
        <div><strong>${money(order.total)}</strong><small>${escapeHtml(order.payment || '-')}</small></div>
        <div><span class="list-status ${escapeHtml(status)}">${escapeHtml(STATUS[status]?.label || status)}</span></div>
        <button type="button" onclick="openOrderModal(${Number(order.id)})">Abrir</button>
      </div>
    `;
  }).join('');
}

function render() {
  renderMetrics();
  renderKanban();
  if (currentView === 'lista') renderList();
  document.getElementById('lastUpdate').textContent =
    `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
  const expirationInfo = document.getElementById('expirationInfo');
  if (expirationInfo) expirationInfo.textContent = `Pedidos sem WhatsApp expiram após ${expirationMinutes} min.`;
}

async function loadOrders({ announce = true } = {}) {
  try {
    const response = await fetch('/api/admin/operation/orders', { cache: 'no-store' });

    if (response.status === 401) {
      window.location.href = '/admin/login.html';
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Erro ao carregar pedidos.');

    expirationMinutes = Number(data.expirationMinutes || 60);
    const newOrders = data.orders || [];
    const newAwaiting = new Set(
      newOrders
        .filter(order => getStatus(order) === 'aguardando_whatsapp')
        .map(order => Number(order.id))
    );

    const justArrived = [...newAwaiting].filter(id => !previousAwaitingIds.has(id));

    if (!firstLoad && announce && justArrived.length) {
      playAlert();
      showToast(`🔔 ${justArrived.length === 1 ? 'Novo pedido' : `${justArrived.length} novos pedidos`} aguardando WhatsApp.`);
      document.getElementById('newOrderBanner').hidden = false;
      document.getElementById('newOrderBannerText').textContent =
        justArrived.length === 1
          ? `O pedido #${justArrived[0]} precisa ser conferido.`
          : `${justArrived.length} pedidos precisam ser conferidos.`;
    }

    previousAwaitingIds = newAwaiting;
    orders = newOrders;
    firstLoad = false;
    render();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível atualizar os pedidos.');
  }
}

async function advanceOrder(id, nextStatus) {
  const order = orders.find(item => Number(item.id) === Number(id));
  if (!order) return;

  if (nextStatus === 'confirmado') {
    const confirmed = confirm(
      `O pedido #${order.id} foi recebido pelo WhatsApp?\n\n` +
      `Só confirme se a mensagem do cliente realmente chegou.`
    );
    if (!confirmed) return;
  }

  if (nextStatus === 'preparando') {
    const confirmed = confirm(`Iniciar o preparo do pedido #${order.id}?`);
    if (!confirmed) return;
  }

  if (nextStatus === 'entregue') {
    const confirmed = confirm(`Marcar o pedido #${order.id} como entregue/retirado?`);
    if (!confirmed) return;
  }

  if (nextStatus === 'cancelado') {
    const confirmed = confirm(
      `CANCELAR O PEDIDO #${order.id}?\n\n` +
      `Esta ação altera o pedido para CANCELADO e o remove da operação ativa.\n` +
      `Se foi um clique por engano, ele poderá ser restaurado pelo painel antigo de Pedidos.`
    );
    if (!confirmed) return;
  }

  const response = await fetch(`/api/admin/orders/${id}/operation-status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation_status: nextStatus })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    alert(data.error || 'Não foi possível atualizar o pedido.');
    return;
  }

  showToast(`Pedido #${id}: ${data.label || 'etapa atualizada'}.`);
  await loadOrders({ announce: false });
}

function openOrderModal(id) {
  const order = orders.find(item => Number(item.id) === Number(id));
  if (!order) return;

  const status = getStatus(order);
  const config = STATUS[status] || {};
  const whatsapp = whatsappLink(order);

  const items = (order.items || []).map(item => {
    const options = parseOptions(item.selected_options);
    const optionsText = options.length
      ? `<small>↳ ${options.map(option => escapeHtml(option.name)).join(', ')}</small>`
      : '';
    const note = item.item_note
      ? `<div class="modal-note"><strong>Obs.:</strong> ${escapeHtml(item.item_note)}</div>`
      : '';
    const subtotal = Number(item.unit_price ?? item.price ?? 0) * Number(item.quantity || 0);

    return `
      <div class="modal-item">
        <div class="modal-item-top">
          <strong>${Number(item.quantity || 0)}x ${escapeHtml(item.product_name)}</strong>
          <strong>${money(subtotal)}</strong>
        </div>
        ${optionsText}
        ${note}
      </div>
    `;
  }).join('');

  const action = config.next
    ? `<button class="main" onclick="closeModal(); advanceOrder(${Number(order.id)}, '${config.next}')">${config.action}</button>`
    : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title">
      <h2>Pedido #${Number(order.id)}</h2>
      <p>${escapeHtml(config.label || status)} • ${formatDateTime(order.created_at)} • ${ageLabel(order.created_at)}</p>
    </div>

    <div class="modal-grid">
      <div class="modal-box">
        <strong>Cliente</strong>
        <span>${escapeHtml(order.customer_name || 'Não informado')}<br>${escapeHtml(order.customer_phone || 'Telefone não informado')}</span>
      </div>
      <div class="modal-box">
        <strong>Entrega / retirada</strong>
        <span>${escapeHtml(order.address || 'Retirada na loja')}</span>
      </div>
      <div class="modal-box">
        <strong>Pagamento</strong>
        <span>${escapeHtml(order.payment || '-')}<br>Status: ${escapeHtml(order.payment_status || 'Aguardando pagamento')}</span>
      </div>
      <div class="modal-box">
        <strong>Observação</strong>
        <span>${escapeHtml(order.note || 'Sem observação.')}</span>
      </div>
    </div>

    <div class="modal-items">${items || '<div class="modal-item">Nenhum item encontrado.</div>'}</div>

    <div class="modal-footer">
      <div class="modal-total">${money(order.total)}</div>
      <div class="modal-actions">
        ${action}
        ${whatsapp ? `<a class="secondary" href="${whatsapp}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
        <button class="secondary" onclick="closeModal()">Fechar sem alterar</button>
        <button class="danger" onclick="advanceOrder(${Number(order.id)}, 'cancelado')">⚠ Cancelar pedido</button>
      </div>
    </div>
  `;

  document.getElementById('orderModal').hidden = false;
}

function closeModal() {
  document.getElementById('orderModal').hidden = true;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function playAlert() {
  if (!soundEnabled) return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = 880;
    gain.gain.value = 0.045;
    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.addEventListener('ended', () => context.close());
  } catch (error) {
    console.warn('Aviso sonoro bloqueado pelo navegador.', error);
  }
}

function setView(view) {
  currentView = view;
  document.querySelectorAll('.view-button').forEach(button => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  document.getElementById('kanbanView').hidden = view !== 'kanban';
  document.getElementById('listView').hidden = view !== 'lista';
  if (view === 'lista') renderList();
}

document.querySelectorAll('.view-button').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

document.getElementById('refreshBtn').addEventListener('click', () => loadOrders({ announce: false }));
document.getElementById('listSearch').addEventListener('input', renderList);
document.getElementById('listStatus').addEventListener('change', renderList);
document.getElementById('closeModal').addEventListener('click', closeModal);
document.querySelector('[data-close-modal]').addEventListener('click', closeModal);

document.getElementById('viewNewOrdersBtn').addEventListener('click', () => {
  document.getElementById('newOrderBanner').hidden = true;
  setView('kanban');
  window.scrollTo({ top: document.querySelector('.kanban').offsetTop - 90, behavior: 'smooth' });
});

document.getElementById('soundBtn').addEventListener('click', async () => {
  soundEnabled = !soundEnabled;
  document.getElementById('soundBtn').textContent = soundEnabled ? '🔔 Som' : '🔕 Som';
  if (soundEnabled) playAlert();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeModal();
});

window.addEventListener('beforeunload', () => clearInterval(refreshTimer));

loadOrders();
refreshTimer = setInterval(() => loadOrders(), 5000);
