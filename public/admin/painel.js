let categories = [];
let products = [];
let filtered = [];

const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function checkAuth() {
  const res = await fetch('/api/admin/me');
  if (!res.ok) {
    window.location.href = '/admin/login.html';
    return;
  }
  const data = await res.json();
  document.getElementById('accountUsername').value = data.username || '';
}

async function loadCategories() {
  const res = await fetch('/api/categories');
  categories = await res.json();
  document.getElementById('category').innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadProducts() {
  const res = await fetch('/api/admin/products');
  products = await res.json();
  applySearch();
}

function applySearch() {
  const term = document.getElementById('search').value.toLowerCase().trim();
  filtered = products.filter(p => !term || p.name.toLowerCase().includes(term) || (p.category_name || '').toLowerCase().includes(term));
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById('productsTable');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum produto encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td>
        <div class="product-cell">
          <div class="thumb">${p.image ? `<img src="${p.image}" alt="${p.name}">` : '🍔'}</div>
          <div><strong>${p.name}</strong><br><small>${p.description || ''}</small></div>
        </div>
      </td>
      <td>${p.category_name || '-'}</td>
      <td><strong>${money(p.price)}</strong></td>
      <td><span class="status ${p.active ? 'on' : 'off'}">${p.active ? 'Disponível' : 'Indisponível'}</span></td>
      <td>
        <div class="actions">
          <button class="edit" onclick="editProduct(${p.id})">Editar</button>
          <button class="delete" onclick="deleteProduct(${p.id})">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function clearForm() {
  document.getElementById('formTitle').textContent = 'Novo produto';
  document.getElementById('productId').value = '';
  document.getElementById('name').value = '';
  document.getElementById('description').value = '';
  document.getElementById('price').value = '';
  document.getElementById('image').value = '';
  document.getElementById('active').checked = true;
  document.getElementById('featured').checked = false;
  document.getElementById('formMsg').textContent = '';
}

function editProduct(id) {
  const p = products.find(item => item.id === id);
  if (!p) return;
  document.getElementById('formTitle').textContent = 'Editar produto';
  document.getElementById('productId').value = p.id;
  document.getElementById('name').value = p.name;
  document.getElementById('description').value = p.description || '';
  document.getElementById('price').value = p.price;
  document.getElementById('category').value = p.category_id || '';
  document.getElementById('active').checked = !!p.active;
  document.getElementById('featured').checked = !!p.featured;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
  if (!confirm('Deseja excluir este produto?')) return;
  await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
  await loadProducts();
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const form = new FormData();
  form.append('name', document.getElementById('name').value);
  form.append('description', document.getElementById('description').value);
  form.append('price', document.getElementById('price').value);
  form.append('category_id', document.getElementById('category').value);
  form.append('active', document.getElementById('active').checked ? '1' : '0');
  form.append('featured', document.getElementById('featured').checked ? '1' : '0');
  const file = document.getElementById('image').files[0];
  if (file) form.append('image', file);

  const res = await fetch(id ? `/api/admin/products/${id}` : '/api/admin/products', {
    method: id ? 'PUT' : 'POST',
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    document.getElementById('formMsg').textContent = data.error || 'Erro ao salvar.';
    return;
  }
  document.getElementById('formMsg').textContent = 'Produto salvo com sucesso.';
  clearForm();
  await loadProducts();
}

async function addCategory() {
  const input = document.getElementById('newCategory');
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch('/api/admin/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    alert('Não foi possível cadastrar a categoria. Talvez ela já exista.');
    return;
  }
  input.value = '';
  await loadCategories();
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/admin/login.html';
}

async function updateAccount(e) {
  e.preventDefault();
  const msg = document.getElementById('accountMsg');
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    msg.textContent = 'A confirmação da senha não confere.';
    return;
  }

  msg.textContent = 'Atualizando acesso...';
  const res = await fetch('/api/admin/account', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: document.getElementById('accountUsername').value,
      currentPassword: document.getElementById('currentPassword').value,
      newPassword,
      confirmPassword
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    msg.textContent = data.error || 'Não foi possível atualizar o acesso.';
    return;
  }

  alert('Acesso atualizado com sucesso. Entre novamente com o novo usuário e senha.');
  window.location.href = '/admin/login.html';
}

document.getElementById('productForm').addEventListener('submit', saveProduct);
document.getElementById('clearBtn').addEventListener('click', clearForm);
document.getElementById('addCategoryBtn').addEventListener('click', addCategory);
document.getElementById('search').addEventListener('input', applySearch);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('accountForm').addEventListener('submit', updateAccount);

(async function init() {
  await checkAuth();
  await loadCategories();
  await loadProducts();
  await loadAudit();
  await loadAccessLogs();
  await loadOrders();
  await loadSettings();
})();

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

function detailText(details) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(' • ');
}

async function loadAudit() {
  const box = document.getElementById('auditList');
  if (!box) return;
  const res = await fetch('/api/admin/audit');
  if (!res.ok) return;
  const logs = await res.json();
  if (!logs.length) {
    box.innerHTML = '<div class="log-empty">Nenhuma modificação registrada ainda.</div>';
    return;
  }
  box.innerHTML = logs.map(log => `
    <div class="log-item">
      <strong>${log.action}</strong>
      <small>${formatDateTime(log.created_at)} • usuário: ${log.user || '-'} • IP: ${log.ip || '-'}</small>
      <small>${detailText(log.details)}</small>
    </div>
  `).join('');
}

async function loadAccessLogs() {
  const res = await fetch('/api/admin/access-logs');
  if (!res.ok) return;
  const data = await res.json();
  document.getElementById('accessTotal').textContent = data.total || 0;
  document.getElementById('accessToday').textContent = data.today || 0;
  document.getElementById('accessUnique').textContent = data.uniqueIps || 0;

  const box = document.getElementById('accessList');
  if (!box) return;
  const logs = data.logs || [];
  if (!logs.length) {
    box.innerHTML = '<div class="log-empty">Nenhum acesso registrado ainda.</div>';
    return;
  }
  box.innerHTML = logs.map(log => `
    <div class="log-item">
      <strong>${log.page || 'loja'} acessada</strong>
      <small>${formatDateTime(log.created_at)} • IP: ${log.ip || '-'}</small>
      <small>${log.user_agent || ''}</small>
    </div>
  `).join('');
}

document.getElementById('refreshAuditBtn')?.addEventListener('click', loadAudit);
document.getElementById('refreshAccessBtn')?.addEventListener('click', loadAccessLogs);

async function loadOrders() {
  const box = document.getElementById('ordersList');
  if (!box) return;

  const res = await fetch('/api/admin/orders');

  if (!res.ok) {
    box.innerHTML = '<div class="order-empty">Erro ao carregar pedidos.</div>';
    return;
  }

  const orders = await res.json();

  if (!orders.length) {
    box.innerHTML = '<div class="order-empty">Nenhum pedido recebido ainda.</div>';
    return;
  }

  box.innerHTML = orders.map(order => {
    const itemsHtml = (order.items || []).map(item => `
      <li>
        ${item.quantity}x ${item.product_name}
        <strong>${money(Number(item.price) * Number(item.quantity))}</strong>
      </li>
    `).join('');

    return `
      <div class="order-card">
        <div class="order-top">
          <div>
            <strong>Pedido #${order.id}</strong>
            <small>${formatDateTime(order.created_at)}</small>
          </div>

          <span class="order-status ${order.status}">
            ${formatStatus(order.status)}
          </span>
        </div>

        <div class="order-client">
          <strong>Cliente:</strong> ${order.customer_name || 'Não informado'}
          ${order.customer_phone ? `<br><strong>Telefone:</strong> ${order.customer_phone}` : ''}
          <br><strong>Endereço/Retirada:</strong> ${order.address || '-'}
          <br><strong>Pagamento:</strong> ${order.payment || '-'}
          <br><strong>Observação:</strong> ${order.note || '-'}
        </div>

        <ul class="order-items">
          ${itemsHtml}
        </ul>

        <div class="order-footer">
          <strong>Total: ${money(order.total)}</strong>

          <select onchange="changeOrderStatus(${order.id}, this.value)">
            <option value="novo" ${order.status === 'novo' ? 'selected' : ''}>Novo</option>
            <option value="producao" ${order.status === 'producao' ? 'selected' : ''}>Em produção</option>
            <option value="finalizado" ${order.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
            <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
          </select>
        </div>
      </div>
    `;
  }).join('');
}

function formatStatus(status) {
  const map = {
    novo: 'Novo',
    producao: 'Em produção',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado'
  };

  return map[status] || status;
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

document.getElementById('refreshOrdersBtn')?.addEventListener('click', loadOrders);



async function loadSettings() {
  const res = await fetch('/api/admin/settings');

  if (!res.ok) return;

  const settings = await res.json();

  const whatsappInput = document.getElementById('settingWhatsapp');
  const isOpenInput = document.getElementById('settingIsOpen');

  if (whatsappInput) {
    whatsappInput.value = settings.whatsapp_number || '';
  }

  if (isOpenInput) {
    isOpenInput.checked = Number(settings.is_open) === 1;
  }
}

async function saveSettings(event) {
  event.preventDefault();

  const payload = {
    whatsapp_number: document.getElementById('settingWhatsapp').value.trim(),
    is_open: document.getElementById('settingIsOpen').checked
  };

  const res = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (!res.ok) {
    alert(data.error || 'Erro ao salvar configurações.');
    return;
  }

  alert('Configurações salvas com sucesso.');
}


document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);