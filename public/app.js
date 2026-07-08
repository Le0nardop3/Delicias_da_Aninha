let products = [];
let categories = [];
let cart = [];
let currentCategory = 'Todos';
let whatsappNumber = '5583999999999';
let isStoreOpen = true;
let currentCustomer = null;
let selectedAddress = null;
let addressTimer = null;
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



function montarEnderecoFinal() {
  const addressSearch = document.getElementById('addressSearch');
  const addressNumber = document.getElementById('addressNumber');
  const addressComplement = document.getElementById('addressComplement');
  const addressReference = document.getElementById('addressReference');

  let rua = addressSearch?.value.trim() || '';

  if (selectedAddress?.address) {
    const a = selectedAddress.address;

    const logradouro =
      a.road ||
      a.pedestrian ||
      a.residential ||
      a.street ||
      rua;

    const bairro =
      a.suburb ||
      a.neighbourhood ||
      a.city_district ||
      '';

    const cidade =
      a.city ||
      a.town ||
      a.municipality ||
      'João Pessoa';

    const estado =
      a.state ||
      'Paraíba';

    rua = [logradouro, bairro, cidade, estado]
      .filter(Boolean)
      .join(', ');
  }

  const numero = addressNumber?.value.trim() || '';
  const complemento = addressComplement?.value.trim() || '';
  const referencia = addressReference?.value.trim() || '';

  let endereco = rua;

  if (numero) endereco += `, Nº ${numero}`;
  if (complemento) endereco += `, Complemento: ${complemento}`;
  if (referencia) endereco += `, Referência: ${referencia}`;

  return endereco;
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
      const a = item.address || {};

      const logradouro =
        a.road ||
        a.pedestrian ||
        a.residential ||
        a.street ||
        '';

      const bairro =
        a.suburb ||
        a.neighbourhood ||
        a.city_district ||
        '';

      const cidade =
        a.city ||
        a.town ||
        a.municipality ||
        'João Pessoa';

      const estado =
        a.state ||
        'Paraíba';

      const textoLimpo = [logradouro, bairro, cidade, estado]
        .filter(Boolean)
        .join(', ');

      return `
    <div
      class="address-suggestion"
      onclick="selecionarEndereco(${index})"
    >
      ${textoLimpo || item.display_name}
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

  const addressSearch = document.getElementById('addressSearch');
  const box = document.getElementById('addressSuggestions');
  const numberInput = document.getElementById('addressNumber');

  if (addressSearch) {
    const a = endereco.address || {};

const logradouro =
  a.road ||
  a.pedestrian ||
  a.residential ||
  a.street ||
  endereco.display_name;

const bairro =
  a.suburb ||
  a.neighbourhood ||
  a.city_district ||
  '';

const cidade =
  a.city ||
  a.town ||
  a.municipality ||
  'João Pessoa';

const estado =
  a.state ||
  'Paraíba';

addressSearch.value = [logradouro, bairro, cidade, estado]
  .filter(Boolean)
  .join(', ');
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
  const address = montarEnderecoFinal();
  const payment = document.getElementById('paymentMethod').value;
  const note = document.getElementById('orderNote').value.trim();

  if (!address || address.length < 8) {
    alert('Informe um endereço válido.');
    return;
  }

  try {
    // 🔹 SALVAR NO BANCO
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


loadData().catch(() => {
  document.getElementById('products').innerHTML = '<p>Não foi possível carregar o cardápio.</p>';
});
