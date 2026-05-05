let products = [];
let categories = [];
let cart = [];
let currentCategory = 'Todos';
let whatsappNumber = '5583999999999';
let isStoreOpen = true;

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

  const name = document.getElementById('customerName').value.trim();
  const address = document.getElementById('customerAddress').value.trim();
  const payment = document.getElementById('paymentMethod').value;
  const note = document.getElementById('orderNote').value.trim();

  try {
    // 🔹 SALVAR NO BANCO
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: name,
        customer_phone: '',
        address: address,
        payment: payment,
        note: note,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price
        }))
      })
    });

    const data = await response.json();

    if (!data.ok) {
      alert('Erro ao salvar pedido');
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

loadData().catch(() => {
  document.getElementById('products').innerHTML = '<p>Não foi possível carregar o cardápio.</p>';
});
