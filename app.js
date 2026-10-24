import { LOJA_ID, API_BASE } from './config.js';

/* =========================================================
   GESTOK PDV — cliente
   Fala somente com a API segura (Cloud Functions). O total, o estoque
   e a baixa são calculados/validados no servidor.
========================================================= */

const $ = (id) => document.getElementById(id);
const state = { session: null, produtos: [], cart: [], payment: 'dinheiro', busy: false };
const NOMES_PAGAMENTO = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito' };

const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtQtd = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const centavos = (v) => Math.round(Number(v) * 100);
const arred3 = (n) => Math.round(n * 1000) / 1000;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

// Aceita "10", "10,5", "10.5" e "1.234,56"
function lerValor(txt) {
  let t = String(txt || '').trim().replace(/[^\d.,]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return Number(t) || 0;
}

const totalVenda = () => state.cart.reduce((s, i) => s + centavos(i.preco * i.qtd), 0) / 100;

function getLojaId() {
  if (LOJA_ID) return LOJA_ID;
  return new URLSearchParams(location.search).get('lojaId') || localStorage.getItem('gestok_pdv_loja_id') || '';
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- API ---------- */
async function api(caminho, { metodo = 'GET', corpo, autenticado = true } = {}) {
  const cab = { 'Content-Type': 'application/json' };
  if (autenticado && state.session) cab.Authorization = 'Bearer ' + state.session.token;
  let resp;
  try {
    resp = await fetch(API_BASE + caminho, { method: metodo, headers: cab, body: corpo ? JSON.stringify(corpo) : undefined });
  } catch (e) {
    const erro = new Error('Sem conexão com o servidor. Verifique a internet.');
    erro.rede = true;
    throw erro;
  }
  let dados = {};
  try { dados = await resp.json(); } catch (e) { /* sem corpo */ }
  if (!resp.ok) {
    const erro = new Error(dados.mensagem || 'Erro ao falar com o servidor.');
    erro.status = resp.status;
    erro.codigo = dados.erro;
    throw erro;
  }
  return dados;
}

/* ---------- sessão ---------- */
function sair(aviso) {
  sessionStorage.removeItem('gestok_pdv_sessao');
  if (aviso) sessionStorage.setItem('gestok_pdv_aviso', aviso);
  location.reload();
}

/* ---------- carrinho ---------- */
function render() {
  const c = $('cart');
  c.innerHTML = '';
  $('emptyCart').classList.toggle('hidden', state.cart.length > 0);
  state.cart.forEach((i, idx) => {
    const r = document.createElement('div');
    r.className = 'cart-row';
    r.innerHTML =
      `<div class="qty"><button data-i="${idx}" data-act="minus" aria-label="Diminuir">−</button>` +
      `<button class="qty-val" data-i="${idx}" data-act="edit" title="Alterar quantidade">${fmtQtd(i.qtd)}</button>` +
      `<button data-i="${idx}" data-act="plus" aria-label="Aumentar">+</button></div>` +
      `<div class="product-name">${esc(i.nome)}<small>${esc(i.codigo)} · ${esc(i.unidade)}</small></div>` +
      `<div>${money(i.preco)} un.</div>` +
      `<div class="price"><b>${money(i.preco * i.qtd)}</b></div>` +
      `<button class="remove" data-i="${idx}" data-act="remove" aria-label="Remover">×</button>`;
    c.appendChild(r);
  });

  const total = totalVenda();
  $('total').textContent = money(total);
  const n = state.cart.reduce((s, i) => s + i.qtd, 0);
  $('itemCount').textContent = `${fmtQtd(n)} ${n === 1 ? 'item' : 'itens'}`;

  const rec = lerValor($('received').value);
  $('change').textContent = money(Math.max(0, rec - total));
  const faltaDinheiro = state.payment === 'dinheiro' && centavos(rec) < centavos(total);
  $('finishBtn').disabled = !state.cart.length || state.busy || faltaDinheiro;
  $('finishBtn').classList.toggle('loading', state.busy);
  $('finishLabel').textContent = state.busy ? 'FINALIZANDO...' : 'FINALIZAR VENDA';
}

function add(p, q = 1) {
  const existente = state.cart.find((x) => x.id === p.id);
  const novaQtd = (existente ? existente.qtd : 0) + q;
  if (p.quantidade <= 0) { toast(`Sem estoque: ${p.nome}`); return; }
  if (novaQtd > p.quantidade + 1e-9) { toast('Quantidade maior que o estoque disponível.'); return; }
  if (!(p.preco > 0)) { toast(`Produto sem preço cadastrado: ${p.nome}`); return; }
  if (existente) existente.qtd = arred3(novaQtd);
  else state.cart.push({ id: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade, preco: p.preco, qtd: q, estoque: p.quantidade });
  render();
}

function filtrar(termo) {
  const t = termo.trim().toLowerCase();
  if (!t) return [];
  return state.produtos
    .filter((p) => String(p.codigo).toLowerCase().includes(t) || String(p.nome).toLowerCase().includes(t))
    .slice(0, 8);
}

function mostrarResultados(termo) {
  const box = $('searchResults');
  if (!termo.trim()) { box.classList.add('hidden'); return; }
  const r = filtrar(termo);
  box.innerHTML = r.length
    ? r.map((p) =>
        `<div class="result ${p.quantidade <= 0 ? 'sem-estoque' : ''}" data-id="${esc(p.id)}"><div><b>${esc(p.nome)}</b>` +
        `<small>${esc(p.codigo)} · ${p.quantidade <= 0 ? '<span class="esgotado">sem estoque</span>' : 'estoque ' + fmtQtd(p.quantidade) + ' ' + esc(p.unidade)}</small></div>` +
        `<strong>${money(p.preco)}</strong></div>`).join('')
    : '<div class="result"><span>Nenhum produto encontrado.</span></div>';
  box.classList.remove('hidden');
}

function limparBusca() {
  $('search').value = '';
  $('searchResults').classList.add('hidden');
  $('search').focus();
}

/* ---------- produtos ---------- */
async function carregarProdutos() {
  const r = await api('/pdvProdutos');
  state.produtos = (r.produtos || []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  // mantém o carrinho coerente com o estoque/preço mais recentes
  state.cart = state.cart.filter((i) => {
    const p = state.produtos.find((x) => x.id === i.id);
    if (!p) return false;
    i.estoque = p.quantidade;
    i.preco = p.preco;
    if (i.qtd > p.quantidade) i.qtd = p.quantidade;
    return i.qtd > 0;
  });
  render();
}

/* ---------- login ---------- */
async function login(e) {
  e.preventDefault();
  $('loginError').textContent = '';
  const codigo = $('codigo').value.replace(/\D/g, '').slice(0, 4);
  const senha = $('senha').value;
  const lojaId = getLojaId();
  if (codigo.length !== 4) { $('loginError').textContent = 'Informe o código de 4 dígitos.'; return; }
  if (!lojaId) { $('loginError').textContent = 'Configure o ID da loja deste terminal (config.js).'; return; }
  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Entrando...';
  try {
    const r = await api('/pdvLogin', { metodo: 'POST', autenticado: false, corpo: { lojaId, codigo, senha } });
    state.session = { token: r.token, lojaId: r.lojaId, lojaNome: r.lojaNome, operadorId: r.operadorId, nome: r.nome, exp: r.exp };
    sessionStorage.setItem('gestok_pdv_sessao', JSON.stringify(state.session));
    $('senha').value = '';
    await iniciar();
  } catch (err) {
    $('loginError').textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'ENTRAR NO CAIXA';
  }
}

async function iniciar() {
  $('loginView').classList.add('hidden');
  $('pdvView').classList.remove('hidden');
  $('operatorName').textContent = state.session.nome;
  $('lojaLabel').textContent = state.session.lojaNome || 'Loja';
  try {
    await carregarProdutos();
  } catch (err) {
    if (err.status === 401) return sair('Sessão expirada. Entre novamente.');
    toast(err.message || 'Não foi possível carregar os produtos.');
  }
  render();
  $('search').focus();
}

/* ---------- finalizar venda ---------- */
function montarCupom(v, forma) {
  const s = state.session;
  const itens = v.itens.map((i) =>
    `<div class="r-item"><span>${fmtQtd(i.quantidade)} ${esc(i.unidade)} x ${esc(i.nome)}</span><span>${money(i.total)}</span></div>`).join('');
  return `<div class="r-center"><b>${esc(s.lojaNome || 'Gestok PDV')}</b><br>CUPOM NÃO FISCAL</div><hr>` +
    `<div>Venda nº ${v.numero}</div><div>${new Date(v.data).toLocaleString('pt-BR')}</div><div>Operador: ${esc(s.nome)}</div><hr>` +
    `${itens}<hr>` +
    `<div class="r-item r-total"><span>TOTAL</span><span>${money(v.valorTotal)}</span></div>` +
    `<div class="r-item"><span>${esc(NOMES_PAGAMENTO[forma] || forma)}</span><span>${money(v.valorRecebido)}</span></div>` +
    `<div class="r-item"><span>Troco</span><span>${money(v.troco)}</span></div><hr>` +
    `<div class="r-center">Documento sem valor fiscal.<br>Obrigado pela preferência!</div>`;
}

function mostrarVendaConcluida(v, forma) {
  $('doneNumero').textContent = v.numero;
  $('doneTotal').textContent = money(v.valorTotal);
  $('doneTroco').textContent = money(v.troco);
  $('receipt').innerHTML = montarCupom(v, forma);
  $('doneModal').classList.remove('hidden');
  $('btnNova').focus();
}

function novaVenda() {
  $('doneModal').classList.add('hidden');
  limparBusca();
}

async function finalizar() {
  if (state.busy || !state.cart.length) return;
  const total = totalVenda();
  const recebido = lerValor($('received').value);
  const forma = state.payment;
  if (forma === 'dinheiro' && centavos(recebido) < centavos(total)) { toast('Valor recebido menor que o total.'); return; }

  state.busy = true;
  render();
  try {
    const venda = await api('/pdvVenda', {
      metodo: 'POST',
      corpo: { itens: state.cart.map((i) => ({ produtoId: i.id, quantidade: i.qtd })), formaPagamento: forma, valorRecebido: recebido }
    });
    state.cart = [];
    $('received').value = '';
    mostrarVendaConcluida(venda, forma);
    carregarProdutos().catch(() => {}); // atualiza o estoque na tela
  } catch (err) {
    if (err.status === 401) return sair('Sessão expirada. Entre novamente.');
    if (err.status === 402) return sair(err.message);
    toast(err.message || 'Não foi possível finalizar a venda.');
    if (err.codigo === 'estoque' || err.codigo === 'produto' || err.codigo === 'preco') {
      carregarProdutos().catch(() => {});
    }
  } finally {
    state.busy = false;
    render();
  }
}

/* ---------- eventos ---------- */
$('loginForm').addEventListener('submit', login);
$('codigo').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });

$('search').addEventListener('input', (e) => mostrarResultados(e.target.value));
$('search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const termo = e.target.value.trim().toLowerCase();
  if (!termo) return;
  const p = state.produtos.find((x) => String(x.codigo).toLowerCase() === termo) || filtrar(termo)[0];
  if (!p) { toast('Produto não encontrado.'); return; }
  add(p);
  limparBusca();
});
$('searchResults').addEventListener('click', (e) => {
  const r = e.target.closest('.result[data-id]');
  if (!r) return;
  const p = state.produtos.find((x) => x.id === r.dataset.id);
  if (p) add(p);
  limparBusca();
});

$('cart').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const idx = Number(b.dataset.i);
  const i = state.cart[idx];
  if (!i) return;
  if (b.dataset.act === 'plus') {
    if (i.qtd + 1 > i.estoque + 1e-9) { toast('Estoque insuficiente.'); return; }
    i.qtd = arred3(i.qtd + 1);
  } else if (b.dataset.act === 'minus') {
    i.qtd = arred3(i.qtd - 1);
    if (i.qtd <= 0) state.cart.splice(idx, 1);
  } else if (b.dataset.act === 'edit') {
    const v = lerValor(prompt(`Quantidade de "${i.nome}" (${i.unidade}):`, fmtQtd(i.qtd)));
    if (!(v > 0)) return;
    if (i.unidade !== 'KG' && !Number.isInteger(v)) { toast('Este produto só pode ser vendido em quantidade inteira.'); return; }
    if (v > i.estoque + 1e-9) { toast('Quantidade maior que o estoque disponível.'); return; }
    i.qtd = arred3(v);
  } else {
    state.cart.splice(idx, 1);
  }
  render();
});

document.querySelectorAll('.pay').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.pay').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    state.payment = b.dataset.pay;
    $('receivedWrap').style.visibility = state.payment === 'dinheiro' ? 'visible' : 'hidden';
    if (state.payment !== 'dinheiro') $('received').value = '';
    render();
  };
});

$('received').addEventListener('input', render);
$('received').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizar(); } });
$('finishBtn').onclick = finalizar;
$('clearSale').onclick = () => {
  if (state.cart.length && !confirm('Limpar todos os itens da venda?')) return;
  state.cart = [];
  render();
};
$('logoutBtn').onclick = () => {
  if (state.cart.length && !confirm('Há uma venda em andamento. Deseja sair mesmo assim?')) return;
  sair();
};
$('btnNova').onclick = novaVenda;
$('btnPrint').onclick = () => window.print();

document.addEventListener('keydown', (e) => {
  if (e.key === 'F2') { e.preventDefault(); $('search').focus(); }
  else if (e.key === 'F9') { e.preventDefault(); finalizar(); }
  else if (e.key === 'Escape') {
    if (!$('doneModal').classList.contains('hidden')) novaVenda();
    else if (!$('searchResults').classList.contains('hidden')) $('searchResults').classList.add('hidden');
    else if (state.cart.length && confirm('Cancelar a venda atual?')) { state.cart = []; render(); }
  }
});

/* ---------- início ---------- */
const aviso = sessionStorage.getItem('gestok_pdv_aviso');
if (aviso) { $('loginError').textContent = aviso; sessionStorage.removeItem('gestok_pdv_aviso'); }
try {
  const s = JSON.parse(sessionStorage.getItem('gestok_pdv_sessao') || 'null');
  if (s && s.token && s.exp > Date.now()) { state.session = s; iniciar(); }
} catch (e) { sessionStorage.removeItem('gestok_pdv_sessao'); }
