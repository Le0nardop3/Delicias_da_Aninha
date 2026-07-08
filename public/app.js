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
  const product = products.find(p => p.id === id);
  if (!product) return;
  const item = cart.find(i => i.id === id);
  if (item) item.quantity += 1;
  else cart.push({ ...product, quantity: 1 });
  renderCart();
  document.getElementById('cart').classList.add('open');
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter(i => i.id !== id);
  renderCart();
}

function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.quantity * Number(item.price), 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = money(total);

  if (!cart.length) {
    cartItems.innerHTML = '<p>Sua sacola está vazia.</p>';
    return;
  }

  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div>
        <strong>${item.name}</strong><br>
        <small>${item.quantity} x ${money(item.price)}</small>
      </div>
      <div class="cart-actions">
        <button onclick="changeQty(${item.id}, -1)">-</button>
        <strong>${item.quantity}</strong>
        <button onclick="changeQty(${item.id}, 1)">+</button>
      </div>
    </div>
  `).join('');
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
          price: item.price
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
    const subtotal = item.quantity * item.price;
    total += subtotal;

    msg += `• ${item.quantity}x ${item.name} - R$ ${subtotal.toFixed(2).replace('.', ',')}\n`;
  });

  msg += `\nTotal: R$ ${total.toFixed(2).replace('.', ',')}\n\n`;
  msg += `Nome: ${name}\n`;
  msg += `Endereço/Retirada: ${address}\n`;
  msg += `Pagamento: ${payment}\n`;
  msg += `Observação: ${note || 'Nenhuma'}\n`;

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
