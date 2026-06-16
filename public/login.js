document.getElementById('loginBtn').addEventListener('click', async () => {
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value.trim();
  const error = document.getElementById('loginError');
  error.textContent = '';

  if (!phone || !password) {
    error.textContent = 'Preencha todos os campos';
    return;
  }

  try {
    const res = await fetch('/api/customer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });
    const data = await res.json();

    if (!res.ok) {
      error.textContent = data.error || 'Erro ao efetuar login';
      return;
    }

    localStorage.setItem('customerId', data.userId);
    localStorage.setItem('customerName', data.name);
    window.location.href = 'fazer_pedido.html';
  } catch (err) {
    console.error(err);
    error.textContent = 'Erro ao conectar ao servidor';
  }
});
