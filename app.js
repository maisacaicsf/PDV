import {firebaseConfig,LOJA_ID} from './config.js';

// IMPORTANTE: o PDV usa uma instância Firebase SEPARADA da autenticação
// principal do Gestok. Assim o login anônimo do PDV nunca substitui
// o usuário/e-mail que está logado no Gestok, mesmo usando o mesmo projeto.
const pdvApp = firebase.apps.find(app => app.name === 'GestokPDV') || firebase.initializeApp(firebaseConfig, 'GestokPDV');
const auth = pdvApp.auth();
const db = pdvApp.firestore();
const state={session:null,produtos:[],cart:[],payment:'dinheiro',lojaId:''};
const $=id=>document.getElementById(id);const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function getLojaId(){if(LOJA_ID)return LOJA_ID;const p=new URLSearchParams(location.search);return p.get('lojaId')||localStorage.getItem('gestok_pdv_loja_id')||''}
function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
function toast(m){const x=$('toast');x.textContent=m;x.classList.add('show');clearTimeout(window.__t);window.__t=setTimeout(()=>x.classList.remove('show'),2600)}
function total(){return state.cart.reduce((s,i)=>s+i.preco*i.qtd,0)}
function render(){const c=$('cart');c.innerHTML='';$('emptyCart').classList.toggle('hidden',state.cart.length>0);state.cart.forEach((i,idx)=>{const r=document.createElement('div');r.className='cart-row';r.innerHTML=`<div class="qty"><button data-i="${idx}" data-act="minus">−</button><b>${i.qtd}</b><button data-i="${idx}" data-act="plus">+</button></div><div class="product-name">${esc(i.nome)}<small>${esc(i.codigo)}</small></div><div>${money(i.preco)} un.</div><div class="price"><b>${money(i.preco*i.qtd)}</b></div><button class="remove" data-i="${idx}" data-act="remove">×</button>`;c.appendChild(r)});$('total').textContent=money(total());const n=state.cart.reduce((s,i)=>s+i.qtd,0);$('itemCount').textContent=`${n} ${n===1?'item':'itens'}`;const rec=Number(($('received').value||'').replace(',','.'));$('change').textContent=money(Math.max(0,rec-total()));$('finishBtn').disabled=!state.cart.length||(state.payment==='dinheiro'&&rec<total())}
function add(p,q=1){const stock=Number(p.quantidade??0),e=state.cart.find(x=>x.id===p.id);if((e?e.qtd:0)+q>stock){toast('Quantidade maior que o estoque disponível.');return}if(e)e.qtd+=q;else state.cart.push({id:p.id,nome:p.nome,codigo:p.codigo||p.sku||'',preco:Number(p.preco||0),qtd:q,estoque:stock});render()}
function results(term){const t=term.trim().toLowerCase(),box=$('searchResults');if(!t){box.classList.add('hidden');return}const r=state.produtos.filter(p=>String(p.codigo||p.sku||'').toLowerCase().includes(t)||String(p.nome||'').toLowerCase().includes(t)).slice(0,8);box.innerHTML=r.length?r.map(p=>`<div class="result" data-id="${p.id}"><div><b>${esc(p.nome)}</b><small>${esc(p.codigo||p.sku||'')} · estoque ${Number(p.quantidade??0)}</small></div><strong>${money(p.preco)}</strong></div>`).join(''):'<div class="result"><span>Nenhum produto encontrado.</span></div>';box.classList.remove('hidden')}
async function hashSenha(senha, salt) {
  const data = new TextEncoder().encode(`${salt}:${senha}`);
  if (crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  throw new Error('SECURE_HASH_UNAVAILABLE');
}

async function garantirAuthPDV(){
  // Esta autenticação pertence SOMENTE ao app nomeado GestokPDV.
  // Ela não altera o Firebase Auth principal usado pelo Gestok.
  if(auth.currentUser) return auth.currentUser;
  const resultado = await auth.signInAnonymously();
  return resultado.user;
}

async function login(e){
  e.preventDefault();
  $('loginError').textContent='';
  const codigo=$('codigo').value.replace(/\D/g,'').slice(0,4);
  const senha=$('senha').value;
  const lojaId=getLojaId();
  if(codigo.length!==4){$('loginError').textContent='Informe o código de 4 dígitos.';return}
  if(!lojaId){$('loginError').textContent='Configure o lojaId deste terminal.';return}
  try{
    await garantirAuthPDV();
    const ref=db.collection('lojas').doc(lojaId).collection('operadores').doc(codigo);
    const snap=await ref.get();
    if(!snap.exists){$('loginError').textContent='Operador não encontrado nesta loja.';return}
    const op=snap.data();
    if(op.ativo===false){$('loginError').textContent='Este operador está inativo.';return}
    if(!op.senhaHash||!op.senhaSalt){$('loginError').textContent='Este operador ainda não está preparado para o novo login. Recrie-o no Gestok.';return}
    const hash=await hashSenha(senha,op.senhaSalt);
    if(hash!==op.senhaHash){$('loginError').textContent='Código ou senha inválidos.';return}
    state.session={operadorId:codigo,nome:op.nome,lojaId};
    state.lojaId=lojaId;
    sessionStorage.setItem('gestok_pdv_session',JSON.stringify(state.session));
    await start();
  }catch(err){
    console.error(err);
    $('loginError').textContent=err.message==='SECURE_HASH_UNAVAILABLE'?'Abra o PDV por um servidor local (ex.: VS Code Live Server) para ativar a verificação segura.':'Não foi possível consultar os operadores. Verifique a conexão e as regras do Firebase.';
  }
}
async function start(){if(!state.session)return;$('loginView').classList.add('hidden');$('pdvView').classList.remove('hidden');$('operatorName').textContent=state.session.nome;$('lojaLabel').textContent=`Loja ${state.session.lojaId}`;try{const snap=await db.collection('lojas').doc(state.session.lojaId).collection('produtos').orderBy('nome').get();state.produtos=snap.docs.map(d=>({id:d.id,...d.data()}));render()}catch(e){console.error(e);toast('Não foi possível carregar os produtos. Verifique as regras do Firebase.')}}
async function finish(){if(!state.cart.length)return;const loja=state.session.lojaId;const saleRef=db.collection('lojas').doc(loja).collection('vendas').doc();const payload={lojaId:loja,operadorId:state.session.operadorId,operadorNome:state.session.nome,formaPagamento:state.payment,valorTotal:total(),valorRecebido:Number(($('received').value||'0').replace(',','.')),criadoEm:firebase.firestore.FieldValue.serverTimestamp(),itens:state.cart.map(i=>({produtoId:i.id,nome:i.nome,quantidade:i.qtd,preco:i.preco,total:i.preco*i.qtd}))};$('finishBtn').disabled=true;try{await db.runTransaction(async tx=>{for(const i of state.cart){const ref=db.collection('lojas').doc(loja).collection('produtos').doc(i.id);const snap=await tx.get(ref);if(!snap.exists)throw new Error('produto');const p=snap.data(),novo=Number(p.estoque||0)-i.qtd;if(novo<0)throw new Error(`estoque:${i.nome}`);tx.update(ref,{quantidade:novo,dataAtualizacao:new Date().toISOString()})}tx.set(saleRef,payload)});toast('Venda finalizada com sucesso!');state.cart=[];$('received').value='';await start()}catch(e){console.error(e);toast(e.message?.startsWith('estoque:')?`Estoque insuficiente: ${e.message.slice(8)}`:'Não foi possível finalizar a venda.');render()}}
$('loginForm').addEventListener('submit',login);$('codigo').addEventListener('input',e=>e.target.value=e.target.value.replace(/\D/g,'').slice(0,4));$('search').addEventListener('input',e=>results(e.target.value));$('search').addEventListener('keydown',e=>{if(e.key==='Enter'){const p=state.produtos.find(x=>String(x.codigo||x.sku||'')===e.target.value.trim());if(p){add(p);e.target.value='';results('')}}});$('searchResults').addEventListener('click',e=>{const r=e.target.closest('.result[data-id]');if(!r)return;const p=state.produtos.find(x=>x.id===r.dataset.id);if(p)add(p);$('search').value='';$('searchResults').classList.add('hidden');$('search').focus()});$('cart').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const idx=Number(b.dataset.i),i=state.cart[idx];if(!i)return;if(b.dataset.act==='plus'){if(i.qtd>=i.estoque){toast('Estoque insuficiente.');return}i.qtd++}else if(b.dataset.act==='minus'){i.qtd--;if(i.qtd<=0)state.cart.splice(idx,1)}else state.cart.splice(idx,1);render()});document.querySelectorAll('.pay').forEach(b=>b.onclick=()=>{document.querySelectorAll('.pay').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.payment=b.dataset.pay;$('receivedWrap').style.visibility=state.payment==='dinheiro'?'visible':'hidden';render()});$('received').addEventListener('input',render);$('finishBtn').onclick=finish;$('clearSale').onclick=()=>{state.cart=[];render()};$('logoutBtn').onclick=async()=>{sessionStorage.removeItem('gestok_pdv_session');location.reload()};document.addEventListener('keydown',e=>{if(e.key==='F2'){e.preventDefault();$('search').focus()}if(e.key==='Escape')$('searchResults').classList.add('hidden')});
try{const s=JSON.parse(sessionStorage.getItem('gestok_pdv_session')||'null');if(s?.operadorId){state.session=s;state.lojaId=s.lojaId;garantirAuthPDV().then(()=>start()).catch(()=>sessionStorage.removeItem('gestok_pdv_session'))}}catch{}
