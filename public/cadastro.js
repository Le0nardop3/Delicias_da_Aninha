document.getElementById('registerBtn').addEventListener('click', async () => {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value.trim();
  const error = document.getElementById('registerError');
  error.textContent = '';

  if(!name || !phone || !password){
    error.textContent = 'Preencha todos os campos';
    return;
  }

  try {
    const res = await fetch('/api/customer/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({name,phone,password})
    });
    const data = await res.json();

    if(!res.ok){
      error.textContent = data.error || 'Erro ao cadastrar';
      return;
    }

    alert('Cadastro realizado com sucesso!');
    window.location.href = 'login.html';
  } catch(err){
    console.error(err);
    error.textContent = 'Erro ao conectar ao servidor';
  }
});