let orders = [];
let filteredOrders = [];

async function loadOrders() {
  const box = document.getElementById('ordersList');
  if (!box) return;

  const res = await fetch('/api/admin/orders');
  if (!res.ok) {
    box.innerHTML = `<div class="order-empty">Erro ao carregar pedidos.</div>`;
    return;
  }

  orders = await res.json();
  if (!orders.length) {
    box.innerHTML = `<div class="order-empty">Nenhum pedido recebido ainda.</div>`;
    return;
  }

  applyFilters();
}

function applyFilters() {
  const term = document.getElementById('searchOrder')?.value.toLowerCase().trim();
  const status = document.getElementById('filterStatus')?.value;
  const payment = document.getElementById('filterPayment')?.value;
  const startDate = document.getElementById('filterStartDate')?.value;
  const endDate = document.getElementById('filterEndDate')?.value;

  filteredOrders = orders.filter(order => {
    const orderDate = order.created_at ? new Date(order.created_at).toISOString().slice(0,10) : '';
    const matchSearch = !term || String(order.id).includes(term) || (order.customer_name||'').toLowerCase().includes(term) || (order.customer_phone||'').includes(term);
    const matchStatus = !status || order.status === status;
    const matchPayment = !payment || order.payment === payment;
    const matchDate = (!startDate || orderDate >= startDate) && (!endDate || orderDate <= endDate);

    return matchSearch && matchStatus && matchPayment && matchDate;
  });

  document.getElementById('ordersCount').textContent = filteredOrders.length;

  if (!filteredOrders.length) {
    document.getElementById('ordersList').innerHTML = `<div class="order-empty">Nenhum pedido encontrado.</div>`;
    return;
  }

  renderOrders();
}

function renderOrders() {
  const box = document.getElementById('ordersList');

  const statuses = ['novo','producao','finalizado','cancelado','expirado'];
  let html = '';

  statuses.forEach(status => {
    const ordersByStatus = filteredOrders.filter(o => o.status === status);
    if (!ordersByStatus.length) return;

    html += `<h3 class="status-group">${formatStatus(status)}</h3>`;
    ordersByStatus.forEach(order => {
      const itemsHtml = (order.items || []).map(item => `<li>${item.quantity}x ${item.product_name} <strong>${money(Number(item.price)*Number(item.quantity))}</strong></li>`).join('');

      html += `
        <div class="order-card payment-${order.payment_status||'aguardando_pagamento'}">
          <div class="order-top">
            <div><strong>Pedido #${order.id}</strong><br><small>${formatDateTime(order.created_at)}</small></div>
            <span class="order-status ${order.status}">${formatStatus(order.status)}</span>
          </div>
          <div class="order-client">
            <strong>Cliente:</strong> ${order.customer_name||'Não informado'}
            ${order.customer_phone?`<br><strong>Telefone:</strong> ${order.customer_phone}`:''}
            <br><strong>Endereço/Retirada:</strong> ${order.address||'-'}
            <br><strong>Pagamento:</strong> ${order.payment||'-'}
            <br><strong>Status do pagamento:</strong> <span class="payment-status ${order.payment_status||'aguardando_pagamento'}">${formatPaymentStatus(order.payment_status)}</span>
            ${order.paid_at?`<br><strong>Pago em:</strong> ${formatDateTime(order.paid_at)}`:''}
            <br><strong>Observação:</strong> ${order.note||'-'}
          </div>
          <ul class="order-items">${itemsHtml}</ul>
          <div class="order-footer">
            <div>
              <strong>Total: ${money(order.total)}</strong>
              <div class="order-buttons">
                <button class="secondary" onclick="reimprimirPedido(${order.id})">Reimprimir ticket</button>
              </div>
            </div>
            <select onchange="changeOrderStatus(${order.id}, this.value)">
              <option value="novo" ${order.status==='novo'?'selected':''}>Novo</option>
              <option value="producao" ${order.status==='producao'?'selected':''}>Em produção</option>
              <option value="finalizado" ${order.status==='finalizado'?'selected':''}>Finalizado</option>
              <option value="cancelado" ${order.status==='cancelado'?'selected':''}>Cancelado</option>
              <option value="expirado" ${order.status==='expirado'?'selected':''}>Expirado</option>
            </select>
          </div>
        </div>
      `;
    });
  });

  box.innerHTML = html;
}

function formatStatus(status){const map={novo:'Novo',producao:'Em produção',finalizado:'Finalizado',cancelado:'Cancelado',expirado:'Expirado'};return map[status]||status;}
function formatPaymentStatus(status){const map={pago:'Pago',aguardando_pagamento:'Aguardando pagamento',pagamento_na_entrega:'Pagamento na entrega',pendente:'Pendente',recusado:'Recusado',cancelado:'Cancelado',expirado:'Pix expirado'};return map[status]||status;}
async function changeOrderStatus(id,status){const res=await fetch(`/api/admin/orders/${id}/status`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});if(!res.ok){alert('Erro ao alterar status do pedido.');return;}await loadOrders();}
async function reimprimirPedido(id){const confirmar=confirm(`Deseja reimprimir o ticket do pedido #${id}?`);if(!confirmar)return;try{const res=await fetch(`/api/admin/orders/${id}/reprint`,{method:'POST'});const data=await res.json().catch(()=>({}));if(!res.ok){alert(data.error||'Erro ao solicitar reimpressão.');return;}alert('Pedido enviado para reimpressão.');await loadOrders();}catch(err){console.error(err);alert('Erro ao solicitar reimpressão.');}}
function formatDateTime(value){if(!value)return'-';return new Date(value).toLocaleString('pt-BR');}
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

document.getElementById('searchOrder')?.addEventListener('input',applyFilters);
document.getElementById('filterStatus')?.addEventListener('change',applyFilters);
document.getElementById('filterPayment')?.addEventListener('change',applyFilters);
document.getElementById('refreshOrdersBtn')?.addEventListener('click',loadOrders);
document.getElementById('filterStartDate')?.addEventListener('change',applyFilters);
document.getElementById('filterEndDate')?.addEventListener('change',applyFilters);

loadOrders();