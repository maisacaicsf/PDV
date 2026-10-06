import {firebaseConfig,PDV_API,LOJA_ID} from './config.js';
const state={session:null,produtos:[],cart:[],payment:'dinheiro'};
function getLojaId(){
  if(LOJA_ID) return LOJA_ID;
  const params=new URLSearchParams(location.search);
  const fromUrl=params.get('lojaId')||params.get('loja');
  if(fromUrl) return fromUrl;
  try{
    const conta=JSON.parse(localStorage.getItem('gestok_conta')||'null');
    if(conta?.lojaId) return conta.lojaId;
  }catch{}
  return localStorage.getItem('gestok_pdv_loja_id')||'';
}
function apiUrl(path){return `${PDV_API.replace(/\/$/,'')}${path}`;}

const $=id=>document.getElementById(id); const money=v=>v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function toast(msg){const x=$('toast');x.textContent=msg;x.classList.add('show');clearTimeout(window.__t);window.__t=setTimeout(()=>x.classList.remove('show'),2600)}
function total(){return state.cart.reduce((s,i)=>s+i.preco*i.qtd,0)}
function render(){const cart=$('cart'),empty=$('emptyCart'); cart.innerHTML='';empty.classList.toggle('hidden',state.cart.length>0); state.cart.forEach((i,idx)=>{const row=document.createElement('div');row.className='cart-row';row.innerHTML=`<div class="qty"><button data-i="${idx}" data-act="minus">−</button><b>${i.qtd}</b><button data-i="${idx}" data-act="plus">+</button></div><div class="product-name">${esc(i.nome)}<small>${esc(i.codigo||'')}</small></div><div>${money(i.preco)} un.</div><div class="price"><b>${money(i.preco*i.qtd)}</b></div><button class="remove" data-i="${idx}" data-act="remove">×</button>`;cart.appendChild(row)});$('total').textContent=money(total());$('itemCount').textContent=`${state.cart.reduce((s,i)=>s+i.qtd,0)} ${state.cart.reduce((s,i)=>s+i.qtd,0)===1?'item':'itens'}`;calcChange();$('finishBtn').disabled=!state.cart.length|| (state.payment==='dinheiro' && Number($('received').value.replace(',','.'))<total())}
function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function add(p,q=1){const existing=state.cart.find(x=>x.id===p.id);if(existing){if(existing.qtd+q>Number(p.estoque??999999)){toast('Quantidade maior que o estoque disponível.');return}existing.qtd+=q}else state.cart.push({id:p.id,nome:p.nome,codigo:p.codigo||p.sku||'',preco:Number(p.preco||p.precoVenda||0),qtd:q,estoque:Number(p.estoque??999999)});render()}
function results(term){const t=term.trim().toLowerCase();if(!t){$('searchResults').classList.add('hidden');return}const r=state.produtos.filter(p=>String(p.codigo||p.sku||'').toLowerCase().includes(t)||String(p.nome||'').toLowerCase().includes(t)).slice(0,8);const box=$('searchResults');box.innerHTML=r.length?r.map(p=>`<div class="result" data-id="${p.id}"><div><b>${esc(p.nome)}</b><small>${esc(p.codigo||p.sku||'')}</small></div><strong>${money(Number(p.preco||p.precoVenda||0))}</strong></div>`).join(''):`<div class="result"><span>Nenhum produto encontrado.</span></div>`;box.classList.remove('hidden')}
async function login(e){
  e.preventDefault();
  $('loginError').textContent='';
  const codigo=$('codigo').value.replace(/\D/g,'').slice(0,4),senha=$('senha').value,lojaId=getLojaId();
  if(codigo.length!==4){$('loginError').textContent='Informe o código de 4 dígitos.';return}
  if(!lojaId){$('loginError').textContent='Este PDV ainda não está vinculado a uma loja. Configure o lojaId do terminal.';return}
  try{
    const r=await fetch(apiUrl('/operatorLogin'),{method:'POST',headers:{'Content-Type':'application/json','x-loja-id':lojaId},body:JSON.stringify({codigo,senha,lojaId})});
    let body=null;try{body=await r.json()}catch{}
    if(!r.ok){
      if(r.status===401){$('loginError').textContent='Código ou senha inválidos.';return}
      if(r.status===404){$('loginError').textContent='Serviço do PDV não encontrado. Publique as Functions do Gestok.';return}
      if(r.status===400&&body?.error==='lojaId_required'){$('loginError').textContent='PDV sem loja configurada.';return}
      $('loginError').textContent='Não foi possível conectar ao serviço do PDV.';return
    }
    state.session=body;sessionStorage.setItem('gestok_pdv_session',JSON.stringify(state.session));await start();
  }catch(err){
    console.error(err);
    $('loginError').textContent='Não foi possível conectar ao servidor do PDV.';
  }
}
async function start(){if(!state.session)return; $('loginView').classList.add('hidden');$('pdvView').classList.remove('hidden');$('operatorName').textContent=state.session.nome;$('lojaLabel').textContent=state.session.lojaNome||`Loja ${state.session.lojaId||''}`;try{const r=await fetch(apiUrl(`/products?token=${encodeURIComponent(state.session.token)}`));if(!r.ok)throw new Error();state.produtos=await r.json()}catch(e){toast('Não foi possível carregar os produtos.');state.produtos=[]}}
function calcChange(){const rec=Number(($('received').value||'').replace(',','.'));$('change').textContent=money(Math.max(0,rec-total()))}
async function finish(){if(!state.cart.length)return;const payload={token:state.session.token,operadorId:state.session.operadorId,formaPagamento:state.payment,valorRecebido:Number(($('received').value||'0').replace(',','.')),itens:state.cart.map(i=>({produtoId:i.id,quantidade:i.qtd,preco:i.preco}))};$('finishBtn').disabled=true;try{const r=await fetch(apiUrl('/sale'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error();const data=await r.json();toast(`Venda ${data.numero||''} finalizada com sucesso!`);state.cart=[];$('received').value='';render();state.produtos=state.produtos.map(p=>{const item=payload.itens.find(i=>i.produtoId===p.id);return item?{...p,estoque:Number(p.estoque??0)-item.quantidade}:p})}catch(e){toast('Não foi possível finalizar a venda.');render()}}
$('loginForm').addEventListener('submit',login);$('codigo').addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,4));$('search').addEventListener('input',e=>results(e.target.value));$('search').addEventListener('keydown',e=>{if(e.key==='Enter'){const p=state.produtos.find(x=>String(x.codigo||x.sku||'')===e.target.value.trim());if(p){add(p);e.target.value='';results('')}}});$('searchResults').addEventListener('click',e=>{const r=e.target.closest('.result[data-id]');if(!r)return;const p=state.produtos.find(x=>x.id===r.dataset.id);if(p)add(p);$('search').value='';$('searchResults').classList.add('hidden');$('search').focus()});$('cart').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const i=state.cart[Number(b.dataset.i)];if(!i)return;if(b.dataset.act==='plus'){if(i.qtd>=i.estoque){toast('Estoque insuficiente.');return}i.qtd++}else if(b.dataset.act==='minus'){i.qtd--;if(i.qtd<=0)state.cart.splice(Number(b.dataset.i),1)}else state.cart.splice(Number(b.dataset.i),1);render()});document.querySelectorAll('.pay').forEach(b=>b.onclick=()=>{document.querySelectorAll('.pay').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.payment=b.dataset.pay;$('receivedWrap').style.visibility=state.payment==='dinheiro'?'visible':'hidden';render()});$('received').addEventListener('input',render);$('finishBtn').onclick=finish;$('clearSale').onclick=()=>{state.cart=[];render()};$('logoutBtn').onclick=()=>{sessionStorage.removeItem('gestok_pdv_session');location.reload()};document.addEventListener('keydown',e=>{if(e.key==='F2'){e.preventDefault();$('search').focus()}if(e.key==='Escape'){$('searchResults').classList.add('hidden')}});
try{state.session=JSON.parse(sessionStorage.getItem('gestok_pdv_session')||'null')}catch{}if(state.session)start();
