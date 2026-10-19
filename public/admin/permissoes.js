(async () => {
  try {
    const r=await fetch('/api/admin/me',{cache:'no-store'});
    if(!r.ok) { location.replace('/admin/login.html'); return; }
    const {permissions: perms={}}=await r.json();
    document.querySelectorAll('[data-permission]').forEach(el=>{
      el.hidden = perms[el.dataset.permission] !== true;
    });
    // Também filtra links das barras de navegação já existentes.
    document.querySelectorAll('a[href],button[onclick]').forEach(el=>{
      const target=el.getAttribute('href')||el.getAttribute('onclick')||'';
      const permission=/operacao\.html/.test(target)?'operacao':/pedidos\.html/.test(target)?'pedidos':/painel\.html/.test(target)?'painel':null;
      if(permission && !perms[permission]) el.hidden=true;
    });
  } catch(e){console.error('Não foi possível carregar permissões.',e);}
})();
