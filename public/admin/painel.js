let categories = [];
let products = [];
let filtered = [];
let productOptionGroups = [];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

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

  const select = document.getElementById('category');

  select.innerHTML = categories.length
    ? categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
    : '<option value="">Sem categoria cadastrada</option>';

  renderCategoriesList();
}

function renderCategoriesList() {
  const box = document.getElementById('categoriesList');
  if (!box) return;

  if (!categories.length) {
    box.innerHTML = '<small>Nenhuma categoria cadastrada.</small>';
    return;
  }

  box.innerHTML = categories.map(c => `
    <div class="category-admin-item">
      <span>${escapeHtml(c.name)}</span>
      <button type="button" class="delete" onclick="deleteCategory(${c.id})">Apagar</button>
    </div>
  `).join('');
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

  tbody.innerHTML = filtered.map(p => {
    const groupCount = Number(p.option_group_count || 0);
    const optionCount = Number(p.option_count || 0);

    return `
      <tr>
        <td>
          <div class="product-cell">
            <div class="thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : '🍔'}</div>
            <div>
              <strong>${escapeHtml(p.name)}</strong><br>
              <small>${escapeHtml(p.description || '')}</small><br>
              <small>${groupCount ? `${groupCount} grupo(s) • ${optionCount} opção(ões)` : 'Sem opções cadastradas'}</small>
            </div>
          </div>
        </td>
        <td>${escapeHtml(p.category_name || '-')}</td>
        <td><strong>${money(p.price)}</strong></td>
        <td><span class="status ${p.active ? 'on' : 'off'}">${p.active ? 'Disponível' : 'Indisponível'}</span></td>
        <td>
          <div class="actions">
            <button class="edit" onclick="editProduct(${p.id})">Editar</button>
            <button class="delete" onclick="deleteProduct(${p.id})">Excluir</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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
  productOptionGroups = [];
  renderOptionGroupsEditor();
}

async function editProduct(id) {
  const p = products.find(item => Number(item.id) === Number(id));
  if (!p) return;

  document.getElementById('formTitle').textContent = 'Editar produto';
  document.getElementById('productId').value = p.id;
  document.getElementById('name').value = p.name;
  document.getElementById('description').value = p.description || '';
  document.getElementById('price').value = p.price;
  document.getElementById('category').value = p.category_id || '';
  document.getElementById('active').checked = !!p.active;
  document.getElementById('featured').checked = !!p.featured;
  document.getElementById('formMsg').textContent = 'Carregando opções...';

  try {
    const res = await fetch(`/api/admin/products/${p.id}/options`);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || 'Erro ao carregar opções.');

    productOptionGroups = (data.groups || []).map(group => ({
      name: group.name || '',
      required: !!group.required,
      min_selections: Number(group.min_selections || 0),
      max_selections: Number(group.max_selections || 1),
      active: group.active !== false,
      options: (group.options || []).map(option => ({
        name: option.name || '',
        price_adjustment: Number(option.price_adjustment || 0),
        active: option.active !== false
      }))
    }));

    renderOptionGroupsEditor();
    document.getElementById('formMsg').textContent = '';

    document.querySelector('.product-editor-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  } catch (error) {
    productOptionGroups = [];
    renderOptionGroupsEditor();
    document.getElementById('formMsg').textContent = error.message;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
  if (!confirm('Deseja excluir este produto?')) return;
  await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
  await loadProducts();
}

function createEmptyOption() {
  return { name: '', price_adjustment: 0, active: true };
}

function createEmptyOptionGroup() {
  return {
    name: '',
    required: true,
    min_selections: 1,
    max_selections: 1,
    active: true,
    options: [createEmptyOption()]
  };
}

function addOptionGroup() {
  productOptionGroups.push(createEmptyOptionGroup());
  renderOptionGroupsEditor();
}

function removeOptionGroup(groupIndex) {
  const group = productOptionGroups[groupIndex];
  if (!group) return;
  const label = group.name?.trim() || `Grupo ${groupIndex + 1}`;
  if (!confirm(`Deseja remover "${label}" e todas as opções dele?`)) return;
  productOptionGroups.splice(groupIndex, 1);
  renderOptionGroupsEditor();
}

function duplicateOptionGroup(groupIndex) {
  const original = productOptionGroups[groupIndex];
  if (!original) return;
  productOptionGroups.splice(groupIndex + 1, 0, {
    ...original,
    name: original.name ? `${original.name} - cópia` : '',
    options: original.options.map(option => ({ ...option }))
  });
  renderOptionGroupsEditor();
}

function addOptionToGroup(groupIndex) {
  const group = productOptionGroups[groupIndex];
  if (!group) return;
  group.options.push(createEmptyOption());
  renderOptionGroupsEditor();
}

function removeOptionFromGroup(groupIndex, optionIndex) {
  const group = productOptionGroups[groupIndex];
  if (!group) return;
  const option = group.options[optionIndex];
  const label = option?.name?.trim() || `Opção ${optionIndex + 1}`;
  if (!confirm(`Deseja remover "${label}"?`)) return;
  group.options.splice(optionIndex, 1);
  if (!group.options.length) group.options.push(createEmptyOption());
  if (Number(group.max_selections || 1) > group.options.length) {
    group.max_selections = group.options.length;
  }
  renderOptionGroupsEditor();
}

function updateGroupField(groupIndex, field, value) {
  const group = productOptionGroups[groupIndex];
  if (!group) return;

  if (field === 'required') {
    group.required = value === 'required';
    group.min_selections = group.required
      ? Math.max(1, Number(group.min_selections || 1))
      : 0;

    renderOptionGroupsEditor();
    return;
  }

  if (field === 'min_selections' || field === 'max_selections') {
    group[field] = Math.max(0, Number(value || 0));
    renderOptionGroupsEditor();
    return;
  }

  if (field === 'active') {
    group.active = !!value;
    return;
  }

  group[field] = value;

  // Ao digitar o nome, atualiza apenas o título do card.
  // Isso evita perder o foco e permite escrever normalmente.
  if (field === 'name') {
    const title = document.querySelector(
      `[data-option-group-index="${groupIndex}"] .option-group-title`
    );

    if (title) {
      title.textContent = String(value || '').trim() || `Grupo ${groupIndex + 1}`;
    }

    updateGroupWarning(groupIndex);
  }
}

function updateGroupWarning(groupIndex) {
  const group = productOptionGroups[groupIndex];
  const card = document.querySelector(
    `[data-option-group-index="${groupIndex}"]`
  );

  if (!group || !card) return;

  const warningBox = card.querySelector('.option-group-warning');
  if (!warningBox) return;

  const warning = groupWarning(group);
  warningBox.textContent = warning;
  warningBox.classList.toggle('show', !!warning);
}

function updateOptionField(groupIndex, optionIndex, field, value) {
  const group = productOptionGroups[groupIndex];
  if (!group || !group.options[optionIndex]) return;

  if (field === 'price_adjustment') {
    group.options[optionIndex][field] = Math.max(0, Number(value || 0));
  } else if (field === 'active') {
    group.options[optionIndex][field] = !!value;
  } else {
    group.options[optionIndex][field] = value;
  }
}

function groupWarning(group) {
  const min = Number(group.min_selections || 0);
  const max = Number(group.max_selections || 1);
  const optionCount = group.options.length;

  if (!String(group.name || '').trim()) return 'Informe o nome do grupo.';
  if (!optionCount) return 'Adicione pelo menos uma opção.';
  if (max < 1) return 'O máximo deve ser pelo menos 1.';
  if (max < min) return 'O máximo não pode ser menor que o mínimo.';
  if (max > optionCount) return 'O máximo não pode ser maior que a quantidade de opções.';
  if (group.required && min < 1) return 'Grupo obrigatório precisa ter mínimo 1.';
  return '';
}

function renderOptionGroupsEditor() {
  const container = document.getElementById('optionGroupsEditor');
  if (!container) return;

  if (!productOptionGroups.length) {
    container.innerHTML = '<div class="options-editor-empty">Este produto ainda não possui opções. Clique em “Adicionar grupo” para começar.</div>';
    return;
  }

  container.innerHTML = productOptionGroups.map((group, groupIndex) => {
    const warning = groupWarning(group);

    return `
      <article class="option-group-editor-card" data-option-group-index="${groupIndex}">
        <div class="option-group-editor-top">
          <strong class="option-group-title">${escapeHtml(group.name || `Grupo ${groupIndex + 1}`)}</strong>
          <button type="button" class="option-group-remove" onclick="removeOptionGroup(${groupIndex})">Remover grupo</button>
        </div>

        <div class="option-group-editor-body">
          <div class="option-group-fields">
            <div class="option-editor-field">
              <label>Nome do grupo</label>
              <input type="text" maxlength="80" value="${escapeHtml(group.name || '')}" placeholder="Ex.: Escolha o recheio" oninput="updateGroupField(${groupIndex}, 'name', this.value)">
            </div>

            <div class="option-editor-field">
              <label>Tipo de escolha</label>
              <select onchange="updateGroupField(${groupIndex}, 'required', this.value)">
                <option value="required" ${group.required ? 'selected' : ''}>Escolha obrigatória</option>
                <option value="optional" ${!group.required ? 'selected' : ''}>Escolha opcional</option>
              </select>
            </div>
          </div>

          <div class="option-selection-fields">
            <div class="option-editor-field">
              <label>Mínimo de escolhas</label>
              <input type="number" min="0" max="50" value="${Number(group.min_selections || 0)}" onchange="updateGroupField(${groupIndex}, 'min_selections', this.value)">
            </div>

            <div class="option-editor-field">
              <label>Máximo de escolhas</label>
              <input type="number" min="1" max="50" value="${Number(group.max_selections || 1)}" onchange="updateGroupField(${groupIndex}, 'max_selections', this.value)">
            </div>

            <div class="option-editor-field">
              <label>Status do grupo</label>
              <select onchange="updateGroupField(${groupIndex}, 'active', this.value === '1')">
                <option value="1" ${group.active !== false ? 'selected' : ''}>Ativo</option>
                <option value="0" ${group.active === false ? 'selected' : ''}>Inativo</option>
              </select>
            </div>
          </div>

          <div class="option-group-help">
            ${group.required
              ? `O cliente deverá escolher de ${Number(group.min_selections || 1)} até ${Number(group.max_selections || 1)} opção(ões).`
              : `O cliente poderá escolher até ${Number(group.max_selections || 1)} opção(ões), mas não será obrigado.`}
          </div>

          <div class="option-group-warning ${warning ? 'show' : ''}">${escapeHtml(warning)}</div>

          <div class="option-items-editor">
            ${group.options.map((option, optionIndex) => `
              <div class="option-item-editor">
                <div class="option-editor-field">
                  <label>Nome da opção</label>
                  <input type="text" maxlength="100" value="${escapeHtml(option.name || '')}" placeholder="Ex.: Morango" oninput="updateOptionField(${groupIndex}, ${optionIndex}, 'name', this.value)">
                </div>

                <div class="option-editor-field">
                  <label>Valor adicional (R$)</label>
                  <input type="number" min="0" step="0.01" value="${Number(option.price_adjustment || 0)}" onchange="updateOptionField(${groupIndex}, ${optionIndex}, 'price_adjustment', this.value)">
                </div>

                <button type="button" class="option-item-remove" onclick="removeOptionFromGroup(${groupIndex}, ${optionIndex})">Remover</button>
              </div>
            `).join('')}
          </div>

          <div class="option-editor-actions">
            <button type="button" class="option-add-button" onclick="addOptionToGroup(${groupIndex})">+ Adicionar opção</button>
            <button type="button" class="option-duplicate-button" onclick="duplicateOptionGroup(${groupIndex})">Duplicar grupo</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function validateProductOptionGroups() {
  for (let groupIndex = 0; groupIndex < productOptionGroups.length; groupIndex++) {
    const group = productOptionGroups[groupIndex];
    const warning = groupWarning(group);
    if (warning) return `Grupo ${groupIndex + 1}: ${warning}`;

    const names = new Set();
    for (let optionIndex = 0; optionIndex < group.options.length; optionIndex++) {
      const option = group.options[optionIndex];
      const optionName = String(option.name || '').trim();
      if (!optionName) return `Informe o nome da opção ${optionIndex + 1} do grupo "${group.name}".`;

      const normalized = optionName.toLocaleLowerCase('pt-BR');
      if (names.has(normalized)) return `A opção "${optionName}" está repetida no grupo "${group.name}".`;
      names.add(normalized);

      const price = Number(option.price_adjustment || 0);
      if (!Number.isFinite(price) || price < 0) return `O valor adicional de "${optionName}" é inválido.`;
    }
  }

  return '';
}

async function saveProduct(e) {
  e.preventDefault();

  const msg = document.getElementById('formMsg');
  const validationError = validateProductOptionGroups();
  if (validationError) {
    msg.textContent = validationError;
    return;
  }

  msg.textContent = 'Salvando produto...';

  const currentId = document.getElementById('productId').value;
  const form = new FormData();
  form.append('name', document.getElementById('name').value.trim());
  form.append('description', document.getElementById('description').value.trim());
  form.append('price', document.getElementById('price').value);
  form.append('category_id', document.getElementById('category').value);
  form.append('active', document.getElementById('active').checked ? '1' : '0');
  form.append('featured', document.getElementById('featured').checked ? '1' : '0');

  const file = document.getElementById('image').files[0];
  if (file) form.append('image', file);

  try {
    const productRes = await fetch(currentId ? `/api/admin/products/${currentId}` : '/api/admin/products', {
      method: currentId ? 'PUT' : 'POST',
      body: form
    });

    const productData = await productRes.json().catch(() => ({}));
    if (!productRes.ok) throw new Error(productData.error || 'Erro ao salvar produto.');

    const productId = Number(currentId || productData.id);
    msg.textContent = 'Salvando opções e adicionais...';

    const optionsRes = await fetch(`/api/admin/products/${productId}/options`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: productOptionGroups })
    });

    const optionsData = await optionsRes.json().catch(() => ({}));
    if (!optionsRes.ok) {
      throw new Error(`O produto foi salvo, mas houve erro nas opções: ${optionsData.error || 'erro desconhecido'}`);
    }

    alert('Produto e opções salvos com sucesso.');
    clearForm();
    await loadProducts();
  } catch (error) {
    msg.textContent = error.message || 'Erro ao salvar.';
  }
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

async function deleteCategory(id) {
  const category = categories.find(c => Number(c.id) === Number(id));
  const categoryName = category ? category.name : 'esta categoria';

  if (!confirm(`Deseja apagar a categoria "${categoryName}"?

Os produtos dessa categoria NÃO serão apagados, apenas ficarão sem categoria.`)) {
    return;
  }

  const res = await fetch(`/api/admin/categories/${id}`, {
    method: 'DELETE'
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(data.error || 'Não foi possível apagar a categoria.');
    return;
  }

  alert(data.productsAffected > 0
    ? `Categoria apagada. ${data.productsAffected} produto(s) ficaram sem categoria.`
    : 'Categoria apagada com sucesso.');

  await loadCategories();
  await loadProducts();
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
document.getElementById('addOptionGroupBtn')?.addEventListener('click', addOptionGroup);

(async function init() {
  renderOptionGroupsEditor();
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

