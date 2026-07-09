let products = [];
let categories = [];
let cart = [];
let currentCategory = 'Todos';
let whatsappNumber = '5583999999999';
let isStoreOpen = true;
let currentCustomer = null;
let selectedAddress = null;
let addressTimer = null;
let savedAddresses = [];
let selectedSavedAddress = null;
let customizationProduct = null;
let customizationQuantity = 1;
let editingCartItemKey = null;
const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function loadData() {
  const [configRes, catRes, prodRes] = await Promise.all([
    fetch('/api/config'),
    fetch('/api/categories'),
    fetch('/api/products')
  ]);
  const config = await configRes.json();
  whatsappNumber = config.whatsappNumber;
  isStoreOpen = Number(config.isOpen) === 1;
  categories = await catRes.json();
  products = await prodRes.json();
  renderFilters();
  renderProducts();
  renderCart();
  await checkCustomerSession();
}


function renderFilters() {
  const filters = document.getElementById('filters');
  const names = ['Todos', ...categories.map(c => c.name)];
  filters.innerHTML = names.map(name => `<button class="filter-btn ${name === currentCategory ? 'active' : ''}" onclick="setCategory('${name}')">${name}</button>`).join('');
}

function setCategory(name) {
  currentCategory = name;
  renderFilters();
  renderProducts();
}

function renderProducts() {
  const list = currentCategory === 'Todos' ? products : products.filter(p => p.category_name === currentCategory);
  const container = document.getElementById('products');

  if (!list.length) {
    container.innerHTML = '<p class="empty">Nenhum produto disponível nessa categoria.</p>';
    return;
  }

  const closedNotice = !isStoreOpen
    ? `<div class="closed-notice">No momento estamos fechados para pedidos.</div>`
    : '';

  container.innerHTML = closedNotice + list.map(product => `
    <article class="product">
      <div class="product-img">${product.image ? `<img src="${product.image}" alt="${product.name}">` : '🍔'}</div>
      <div class="product-body">
        <span class="category">${product.category_name || 'Produto'}</span>
        <h3>${product.name}</h3>
        <p>${product.description || 'Produto delicioso preparado com qualidade.'}</p>
        <div class="product-footer">
          <strong class="price">${money(product.price)}</strong>
          <button class="add" onclick="addToCart(${product.id})" ${!isStoreOpen ? 'disabled' : ''}>
            ${isStoreOpen ? 'Adicionar' : 'Loja fechada'}
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

function addToCart(id) {
  if (!isStoreOpen) {
    alert('No momento a loja está fechada para pedidos.');
    return;
  }

  const product = products.find(p => Number(p.id) === Number(id));

  if (!product) return;

  const optionGroups = product.option_groups || [];

  // Produto sem personalização: adiciona diretamente
  if (!optionGroups.length) {
    addSimpleProductToCart(product);
    return;
  }

  // Produto com opções: abre o modal
  openProductCustomization(product);
}


function addSimpleProductToCart(product) {
  const item = cart.find(item =>
    Number(item.id) === Number(product.id) &&
    (!item.selected_options || !item.selected_options.length) &&
    !item.item_note
  );

  if (item) {
    item.quantity += 1;
  } else {
    cart.push({
      ...product,
      cart_key: createCartKey(),
      quantity: 1,
      unit_price: Number(product.price),
      selected_options: [],
      item_note: ''
    });
  }

  renderCart();

  document.getElementById('cart').classList.add('open');
}


function createCartKey() {
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}


function openProductCustomization(product, cartItem = null) {
  customizationProduct = product;
  customizationQuantity = cartItem?.quantity || 1;
  editingCartItemKey = cartItem?.cart_key || null;

  const modal = document.getElementById('productCustomization');
  const category = document.getElementById('customizationCategory');
  const name = document.getElementById('customizationProductName');
  const description = document.getElementById('customizationDescription');
  const groupsContainer = document.getElementById('customizationOptionGroups');
  const note = document.getElementById('customizationNote');

  category.textContent = product.category_name || 'Produto';
  name.textContent = product.name;
  description.textContent =
    product.description ||
    'Produto preparado com qualidade e carinho.';

  note.value = cartItem?.item_note || '';

  groupsContainer.innerHTML = (product.option_groups || []).map(group => {
    const inputType =
      Number(group.max_selections) === 1
        ? 'radio'
        : 'checkbox';

    const selectedIds = cartItem?.selected_options
      ?.filter(option => Number(option.group_id) === Number(group.id))
      .map(option => Number(option.id)) || [];

    const requirementText = group.required
      ? Number(group.max_selections) === 1
        ? 'Obrigatório • Escolha 1 opção'
        : `Obrigatório • Escolha de ${group.min_selections} até ${group.max_selections}`
      : Number(group.max_selections) === 1
        ? 'Opcional • Escolha até 1 opção'
        : `Opcional • Escolha até ${group.max_selections}`;

    return `
      <div
        class="option-group"
        data-group-id="${group.id}"
        data-required="${group.required}"
        data-min="${group.min_selections}"
        data-max="${group.max_selections}"
      >

        <div class="option-group-header">
          <strong>${group.name}</strong>
          <span>${requirementText}</span>
        </div>

        ${group.options.map(option => {
      const checked = selectedIds.includes(Number(option.id))
        ? 'checked'
        : '';

      return `
            <label class="option-row">
              <input
                type="${inputType}"
                name="option_group_${group.id}"
                value="${option.id}"
                data-group-id="${group.id}"
                data-option-name="${escapeHtmlAttribute(option.name)}"
                data-price="${Number(option.price_adjustment || 0)}"
                ${checked}
                onchange="handleCustomizationOptionChange(this)"
              >

              <strong>${option.name}</strong>

              ${Number(option.price_adjustment) > 0
          ? `<span>+ ${money(option.price_adjustment)}</span>`
          : ''
        }
            </label>
          `;
    }).join('')}

      </div>
    `;
  }).join('');

  updateCustomizationPrice();

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}


function closeProductCustomization() {
  const modal = document.getElementById('productCustomization');

  modal.classList.remove('open');

  document.body.style.overflow = '';

  customizationProduct = null;
  customizationQuantity = 1;
  editingCartItemKey = null;
}


function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


function changeCustomizationQuantity(delta) {
  customizationQuantity += delta;

  if (customizationQuantity < 1) {
    customizationQuantity = 1;
  }

  document.getElementById('customizationQuantity').textContent =
    customizationQuantity;

  updateCustomizationPrice();
}


function handleCustomizationOptionChange(input) {
  const groupElement = input.closest('.option-group');

  if (!groupElement) return;

  const maxSelections =
    Number(groupElement.dataset.max || 1);

  if (input.type === 'checkbox') {
    const checkedInputs =
      groupElement.querySelectorAll('input:checked');

    if (checkedInputs.length > maxSelections) {
      input.checked = false;

      alert(
        `Você pode escolher no máximo ${maxSelections} opção(ões) neste grupo.`
      );

      return;
    }
  }

  updateCustomizationPrice();
}


function getSelectedCustomizationOptions() {
  const selectedInputs =
    document.querySelectorAll(
      '#customizationOptionGroups input:checked'
    );

  return Array.from(selectedInputs).map(input => ({
    id: Number(input.value),
    group_id: Number(input.dataset.groupId),
    name: input.dataset.optionName,
    price_adjustment: Number(input.dataset.price || 0)
  }));
}


function validateCustomization() {
  const groups =
    document.querySelectorAll(
      '#customizationOptionGroups .option-group'
    );

  for (const group of groups) {
    const required =
      group.dataset.required === 'true';

    const min =
      Number(group.dataset.min || 0);

    const max =
      Number(group.dataset.max || 1);

    const selected =
      group.querySelectorAll('input:checked').length;

    const groupTitle =
      group.querySelector('.option-group-header strong')
        ?.textContent || 'Opção';

    if (required && selected < min) {
      alert(`Selecione uma opção em "${groupTitle}".`);
      return false;
    }

    if (selected > max) {
      alert(
        `Selecione no máximo ${max} opção(ões) em "${groupTitle}".`
      );

      return false;
    }
  }

  return true;
}


function calculateCustomizedUnitPrice() {
  if (!customizationProduct) return 0;

  const basePrice =
    Number(customizationProduct.price || 0);

  const optionsTotal =
    getSelectedCustomizationOptions()
      .reduce(
        (sum, option) =>
          sum + Number(option.price_adjustment || 0),
        0
      );

  return basePrice + optionsTotal;
}


function updateCustomizationPrice() {
  if (!customizationProduct) return;

  const unitPrice =
    calculateCustomizedUnitPrice();

  const total =
    unitPrice * customizationQuantity;

  document.getElementById(
    'customizationQuantity'
  ).textContent = customizationQuantity;

  document.getElementById(
    'customizationAddButton'
  ).textContent =
    `${editingCartItemKey ? 'Salvar alterações' : 'Adicionar'} • ${money(total)}`;
}


function confirmCustomizedProduct() {
  if (!customizationProduct) return;

  if (!validateCustomization()) return;

  const selectedOptions =
    getSelectedCustomizationOptions();

  const itemNote =
    document
      .getElementById('customizationNote')
      .value
      .trim();

  const unitPrice =
    calculateCustomizedUnitPrice();

  const cartItem = {
    ...customizationProduct,

    cart_key:
      editingCartItemKey ||
      createCartKey(),

    quantity:
      customizationQuantity,

    unit_price:
      unitPrice,

    price:
      unitPrice,

    selected_options:
      selectedOptions,

    item_note:
      itemNote
  };

  if (editingCartItemKey) {
    const index =
      cart.findIndex(
        item => item.cart_key === editingCartItemKey
      );

    if (index !== -1) {
      cart[index] = cartItem;
    }

  } else {
    cart.push(cartItem);
  }

  closeProductCustomization();

  renderCart();

  document
    .getElementById('cart')
    .classList
    .add('open');
}

function changeQty(cartKey, delta) {
  const item = cart.find(
    item => item.cart_key === cartKey
  );

  if (!item) return;

  item.quantity += delta;

  if (item.quantity <= 0) {
    cart = cart.filter(
      item => item.cart_key !== cartKey
    );
  }

  renderCart();
}


function removeCartItem(cartKey) {
  cart = cart.filter(
    item => item.cart_key !== cartKey
  );

  renderCart();
}


function editCartItem(cartKey) {
  const item = cart.find(
    item => item.cart_key === cartKey
  );

  if (!item) return;

  const product = products.find(
    product =>
      Number(product.id) === Number(item.id)
  );

  if (!product) return;

  document
    .getElementById('cart')
    .classList
    .remove('open');

  openProductCustomization(product, item);
}

function renderCart() {
  const cartItems =
    document.getElementById('cartItems');

  const count = cart.reduce(
    (sum, item) =>
      sum + item.quantity,
    0
  );

  const total = cart.reduce(
    (sum, item) =>
      sum +
      item.quantity *
      Number(item.unit_price ?? item.price),
    0
  );

  document
    .getElementById('cartCount')
    .textContent = count;

  document
    .getElementById('cartTotal')
    .textContent = money(total);

  if (!cart.length) {
    cartItems.innerHTML =
      '<p>Sua sacola está vazia.</p>';

    return;
  }

  cartItems.innerHTML =
    cart.map(item => {

      const optionsHtml =
        (item.selected_options || []).length
          ? `
            <div class="cart-item-options">
              ${item.selected_options
            .map(option => `
                  <span>
                    ${option.name}
                    ${Number(option.price_adjustment) > 0
                ? ` (+${money(option.price_adjustment)})`
                : ''
              }
                  </span>
                `)
            .join('')}
            </div>
          `
          : '';

      const noteHtml =
        item.item_note
          ? `
            <div class="cart-item-note">
              Obs.: ${item.item_note}
            </div>
          `
          : '';

      const canEdit =
        (item.option_groups || []).length > 0;

      return `
        <div class="cart-item">

          <div class="cart-item-info">

            <strong>${item.name}</strong>

            ${optionsHtml}

            ${noteHtml}

            <small>
              ${item.quantity} x
              ${money(item.unit_price ?? item.price)}
            </small>

            <div class="cart-item-links">

              ${canEdit
          ? `
                    <button
                      type="button"
                      onclick="editCartItem('${item.cart_key}')"
                    >
                      Editar
                    </button>
                  `
          : ''
        }

              <button
                type="button"
                onclick="removeCartItem('${item.cart_key}')"
              >
                Remover
              </button>

            </div>

          </div>

          <div class="cart-actions">

            <button
              onclick="changeQty('${item.cart_key}', -1)"
            >
              -
            </button>

            <strong>
              ${item.quantity}
            </strong>

            <button
              onclick="changeQty('${item.cart_key}', 1)"
            >
              +
            </button>

          </div>

        </div>
      `;
    }).join('');
}




async function checkCustomerSession() {
  const loginButton = document.querySelector('.btn-enter');
  const nameInput = document.getElementById('customerName');
  const loginRequiredBox = document.getElementById('loginRequiredBox');
  const checkoutForm = document.getElementById('checkoutForm');

  try {
    const response = await fetch('/api/customer/me');

    if (!response.ok) {
      currentCustomer = null;

      if (loginButton) {
        loginButton.textContent = 'Entrar';
        loginButton.href = '/login.html';
      }

      if (loginRequiredBox) {
        loginRequiredBox.style.display = 'block';
      }

      if (checkoutForm) {
        checkoutForm.classList.add('needs-login');
      }

      if (nameInput) {
        nameInput.value = '';
        nameInput.readOnly = true;
      }

      return;
    }

    const data = await response.json();
    currentCustomer = data.customer;

    if (loginButton) {
      loginButton.textContent = 'Minha conta';
      loginButton.href = '/minha-conta.html';
    }

    if (loginRequiredBox) {
      loginRequiredBox.style.display = 'none';
    }

    if (checkoutForm) {
      checkoutForm.classList.remove('needs-login');
    }

    if (nameInput && currentCustomer?.name) {
      nameInput.value = currentCustomer.name;
      nameInput.readOnly = true;
    }
    await loadCustomerAddresses();

  } catch (error) {
    currentCustomer = null;

    if (loginRequiredBox) {
      loginRequiredBox.style.display = 'block';
    }

    if (checkoutForm) {
      checkoutForm.classList.add('needs-login');
    }
  }
}


// ================= ENDEREÇO =================

async function loadCustomerAddresses() {
  if (!currentCustomer) return;

  try {
    const response = await fetch('/api/customer/addresses');

    if (!response.ok) return;

    const data = await response.json();

    savedAddresses = data.addresses || [];

    renderSavedAddresses();

  } catch (error) {
    console.error('Erro ao carregar endereços:', error);
  }
}


function renderSavedAddresses() {
  const box = document.getElementById('savedAddressesBox');
  const list = document.getElementById('savedAddressesList');
  const newAddressBox = document.getElementById('newAddressBox');

  if (!box || !list || !newAddressBox) return;

  if (!savedAddresses.length) {
    box.style.display = 'none';
    newAddressBox.style.display = 'grid';
    selectedSavedAddress = null;
    return;
  }

  box.style.display = 'grid';

  if (!selectedSavedAddress) {
    selectedSavedAddress =
      savedAddresses.find(a => a.is_default) ||
      savedAddresses[0];
  }

  newAddressBox.style.display = 'none';

  list.innerHTML = savedAddresses.map(address => `
    <div class="saved-address-card ${selectedSavedAddress?.id === address.id ? 'selected' : ''}">
      <button
        type="button"
        class="saved-address-main"
        onclick="selectSavedAddress(${address.id})"
      >
        <div class="saved-address-icon">📍</div>

        <div class="saved-address-content">
          <strong>${address.label || 'Meu endereço'}</strong>
          <span>${address.full_address}</span>
          ${address.is_default ? '<em class="default-address-badge">Padrão</em>' : ''}
        </div>
      </button>

      <button
        type="button"
        class="delete-address-button"
        onclick="deleteSavedAddress(${address.id})"
        title="Apagar endereço"
      >
        ×
      </button>
    </div>
  `).join('');
}


function selectSavedAddress(id) {
  selectedSavedAddress = savedAddresses.find(a => Number(a.id) === Number(id)) || null;
  renderSavedAddresses();
}

function backToSavedAddresses() {
  selectedAddress = null;

  const newAddressBox = document.getElementById('newAddressBox');

  if (newAddressBox) {
    newAddressBox.style.display = 'none';
  }

  renderSavedAddresses();
}


async function deleteSavedAddress(id) {
  const confirmDelete = confirm('Deseja apagar este endereço salvo?');

  if (!confirmDelete) return;

  try {
    const response = await fetch(`/api/customer/addresses/${id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.error || 'Erro ao apagar endereço.');
      return;
    }

    savedAddresses = savedAddresses.filter(address => Number(address.id) !== Number(id));

    if (selectedSavedAddress?.id === id) {
      selectedSavedAddress =
        savedAddresses.find(address => address.is_default) ||
        savedAddresses[0] ||
        null;
    }

    renderSavedAddresses();

  } catch (error) {
    alert('Erro ao apagar endereço.');
    console.error(error);
  }
}

function showNewAddressForm() {
  selectedSavedAddress = null;

  const newAddressBox = document.getElementById('newAddressBox');
  const savedAddressesBox = document.getElementById('savedAddressesBox');
  const backButton = document.getElementById('backToSavedAddressesButton');

  if (savedAddressesBox) {
    savedAddressesBox.style.display = 'none';
  }

  if (newAddressBox) {
    newAddressBox.style.display = 'grid';
  }

  if (backButton) {
    backButton.style.display = savedAddresses.length ? 'block' : 'none';
  }

  clearNewAddressForm();
}


function clearNewAddressForm() {
  selectedAddress = null;

  const addressSearch = document.getElementById('addressSearch');
  const addressNumber = document.getElementById('addressNumber');
  const addressComplement = document.getElementById('addressComplement');
  const addressReference = document.getElementById('addressReference');
  const addressLabel = document.getElementById('addressLabel');
  const selectedAddressText = document.getElementById('selectedAddressText');
  const addressDetailsBox = document.getElementById('addressDetailsBox');
  const addressSuggestions = document.getElementById('addressSuggestions');

  if (addressSearch) addressSearch.value = '';
  if (addressNumber) addressNumber.value = '';
  if (addressComplement) addressComplement.value = '';
  if (addressReference) addressReference.value = '';
  if (addressLabel) addressLabel.value = '';
  if (selectedAddressText) selectedAddressText.textContent = '';

  if (addressDetailsBox) {
    addressDetailsBox.style.display = 'none';
  }

  if (addressSuggestions) {
    addressSuggestions.classList.remove('open');
    addressSuggestions.innerHTML = '';
  }
}


function extrairEnderecoLimpo(endereco) {
  const a = endereco?.address || {};

  const street =
    a.road ||
    a.pedestrian ||
    a.residential ||
    a.street ||
    '';

  const neighborhood =
    a.suburb ||
    a.neighbourhood ||
    a.city_district ||
    '';

  const city =
    a.city ||
    a.town ||
    a.municipality ||
    'João Pessoa';

  const state =
    a.state ||
    'PB';

  const cleanText = [street, neighborhood, city, state]
    .filter(Boolean)
    .join(', ');

  return {
    street,
    neighborhood,
    city,
    state,
    cleanText,
    latitude: endereco?.lat ? Number(endereco.lat) : null,
    longitude: endereco?.lon ? Number(endereco.lon) : null
  };
}


function montarEnderecoFinal() {
  if (selectedSavedAddress) {
    return selectedSavedAddress.full_address;
  }

  if (!selectedAddress) {
    return '';
  }

  const clean = extrairEnderecoLimpo(selectedAddress);

  const number = document.getElementById('addressNumber')?.value.trim() || '';
  const complement = document.getElementById('addressComplement')?.value.trim() || '';
  const reference = document.getElementById('addressReference')?.value.trim() || '';

  let endereco = clean.cleanText;

  if (number) endereco += `, Nº ${number}`;
  if (complement) endereco += `, Complemento: ${complement}`;
  if (reference) endereco += `, Referência: ${reference}`;

  return endereco;
}


async function saveCurrentAddressIfNeeded(fullAddress) {
  const saveCheckbox = document.getElementById('saveAddressCheckbox');

  if (!currentCustomer) return;
  if (selectedSavedAddress) return;
  if (!selectedAddress) return;
  if (!saveCheckbox?.checked) return;

  const clean = extrairEnderecoLimpo(selectedAddress);

  const number = document.getElementById('addressNumber')?.value.trim() || '';
  const complement = document.getElementById('addressComplement')?.value.trim() || '';
  const reference = document.getElementById('addressReference')?.value.trim() || '';
  const label = document.getElementById('addressLabel')?.value.trim() || 'Meu endereço';

  const response = await fetch('/api/customer/addresses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      label,
      street: clean.street,
      neighborhood: clean.neighborhood,
      city: clean.city,
      state: clean.state,
      number,
      complement,
      reference,
      full_address: fullAddress,
      latitude: clean.latitude,
      longitude: clean.longitude
    })
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Erro ao salvar endereço.');
  }

  savedAddresses.unshift(data.address);
  selectedSavedAddress = data.address;
  renderSavedAddresses();
}


async function buscarEnderecos(query) {
  const box = document.getElementById('addressSuggestions');

  if (!box) return;

  if (!query || query.length < 4) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=br&q=${encodeURIComponent(query + ', João Pessoa, PB')}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Erro ao buscar endereço');
    }

    const data = await response.json();

    window.__addressResults = data;

    if (!data.length) {
      box.innerHTML = `
        <div class="address-suggestion">
          Nenhum endereço encontrado.
        </div>
      `;

      box.classList.add('open');
      return;
    }

    box.innerHTML = data.map((item, index) => {
      const clean = extrairEnderecoLimpo(item);

      return `
        <div
          class="address-suggestion"
          onclick="selecionarEndereco(${index})"
        >
          ${clean.cleanText || item.display_name}
        </div>
      `;
    }).join('');

    box.classList.add('open');

  } catch (error) {
    console.error('Erro ao buscar endereços:', error);

    box.innerHTML = `
      <div class="address-suggestion">
        Não foi possível buscar os endereços.
      </div>
    `;

    box.classList.add('open');
  }
}


function selecionarEndereco(index) {
  const endereco = window.__addressResults?.[index];

  if (!endereco) return;

  selectedAddress = endereco;
  selectedSavedAddress = null;

  const clean = extrairEnderecoLimpo(endereco);

  const addressSearch = document.getElementById('addressSearch');
  const box = document.getElementById('addressSuggestions');
  const numberInput = document.getElementById('addressNumber');
  const addressDetailsBox = document.getElementById('addressDetailsBox');
  const selectedAddressText = document.getElementById('selectedAddressText');

  if (addressSearch) {
    addressSearch.value = clean.cleanText;
  }

  if (selectedAddressText) {
    selectedAddressText.textContent = clean.cleanText;
  }

  if (addressDetailsBox) {
    addressDetailsBox.style.display = 'grid';
  }

  if (box) {
    box.classList.remove('open');
    box.innerHTML = '';
  }

  if (numberInput) {
    numberInput.focus();
  }
}

async function sendOrder(event) {
  event.preventDefault();

  if (!isStoreOpen) {
    alert('No momento a loja está fechada para pedidos.');
    return;
  }

  if (!cart.length) {
    alert('Adicione pelo menos um produto na sacola.');
    return;
  }

  if (!currentCustomer) {
    alert('Você precisa entrar na sua conta para finalizar o pedido.');
    window.location.href = '/login.html';
    return;
  }





  const name = currentCustomer.name;

  if (!selectedSavedAddress && !selectedAddress) {
    alert('Selecione um endereço da lista antes de finalizar.');
    return;
  }

  const address = montarEnderecoFinal();
  const payment = document.getElementById('paymentMethod').value;
  const note = document.getElementById('orderNote').value.trim();






  if (!address || address.length < 8) {
    alert('Informe um endereço válido.');
    return;
  }

  try {
    await saveCurrentAddressIfNeeded(address);

    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: currentCustomer ? currentCustomer.name : name,
        customer_phone: currentCustomer ? currentCustomer.phone : '',
        address: address,
        payment: payment,
        note: note,
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,

          price: Number(item.price || 0),

          unit_price: Number(
            item.unit_price ?? item.price ?? 0
          ),

          selected_options: (item.selected_options || []).map(option => ({
            id: option.id,
            group_id: option.group_id,
            name: option.name,
            price_adjustment: Number(option.price_adjustment || 0)
          })),

          item_note: item.item_note || ''
        }))
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      alert(data.error || 'Erro ao salvar pedido');

      if (response.status === 401) {
        window.location.href = '/login.html';
      }

      return;
    }

    // 🔹 GERAR MENSAGEM COM ID
    const message = gerarMensagem(cart, data.orderId, name, address, payment, note);

    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

    window.open(url, '_blank');

  } catch (err) {
    alert('Erro ao processar pedido');
    console.error(err);
  }
}


function gerarMensagem(cart, orderId, name, address, payment, note) {
  let msg = `Pedido #${orderId}\n\n`;

  let total = 0;

  cart.forEach(item => {
    const unitPrice = Number(item.unit_price ?? item.price ?? 0);
    const subtotal = item.quantity * unitPrice;

    total += subtotal;

    msg += `• ${item.quantity}x ${item.name}\n`;

    // ================= OPÇÕES ESCOLHIDAS =================

    if (item.selected_options && item.selected_options.length) {
      item.selected_options.forEach(option => {
        msg += `  ↳ ${option.name}`;

        if (Number(option.price_adjustment || 0) > 0) {
          msg += ` (+ R$ ${Number(option.price_adjustment)
            .toFixed(2)
            .replace('.', ',')})`;
        }

        msg += '\n';
      });
    }

    // ================= OBSERVAÇÃO DO ITEM =================

    if (item.item_note) {
      msg += `  ↳ Obs.: ${item.item_note}\n`;
    }

    // ================= PREÇO DO ITEM =================

    msg += `  ↳ Subtotal: R$ ${subtotal
      .toFixed(2)
      .replace('.', ',')}\n`;

    msg += '\n';
  });

  // ================= TOTAL =================

  msg += `Total: R$ ${total
    .toFixed(2)
    .replace('.', ',')}\n\n`;

  // ================= DADOS DO CLIENTE =================

  msg += `Nome: ${name}\n`;
  msg += `Endereço/Retirada: ${address}\n`;
  msg += `Pagamento: ${payment}\n`;
  msg += `Observação do pedido: ${note || 'Nenhuma'}\n`;

  return msg;
}

document.getElementById('openCart').addEventListener('click', () => document.getElementById('cart').classList.add('open'));
document.getElementById('closeCart').addEventListener('click', () => document.getElementById('cart').classList.remove('open'));
document.getElementById('checkoutForm').addEventListener('submit', sendOrder);

// ================= BUSCA DE ENDEREÇO =================

const addressSearchInput = document.getElementById('addressSearch');

if (addressSearchInput) {
  addressSearchInput.addEventListener('input', (event) => {
    const query = event.target.value.trim();

    // Se o cliente alterar o endereço depois de selecionar,
    // removemos a seleção anterior.
    selectedAddress = null;

    clearTimeout(addressTimer);

    addressTimer = setTimeout(() => {
      buscarEnderecos(query);
    }, 500);
  });
}
document.getElementById('newAddressButton')?.addEventListener('click', showNewAddressForm);
document.getElementById('backToSavedAddressesButton')?.addEventListener('click', backToSavedAddresses);

loadData().catch(() => {
  document.getElementById('products').innerHTML = '<p>Não foi possível carregar o cardápio.</p>';
});
