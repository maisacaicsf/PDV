const {onRequest}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
admin.initializeApp();
const db=admin.firestore();
const crypto=require('crypto');
const cors=require('cors');
const corsHandler=cors({origin:true});
const hash=(senha,salt)=>crypto.createHash('sha256').update(salt+senha).digest('hex');
function token(data){return Buffer.from(JSON.stringify({...data,iat:Date.now()})).toString('base64url')+'.'+crypto.randomBytes(24).toString('hex')}
function readToken(t){try{return JSON.parse(Buffer.from((t||'').split('.')[0],'base64url').toString())}catch{return null}}
exports.operatorLogin=onRequest((req,res)=>corsHandler(req,res,async()=>{if(req.method!=='POST')return res.status(405).end();try{const {codigo,senha}=req.body||{};if(!/^\d{4}$/.test(codigo)||!senha)return res.status(400).json({error:'invalid'});
// O PDV deve receber o lojaId por configuração/instalação. Para a primeira versão, informe LOJA_ID no header.
const lojaId=req.get('x-loja-id')||req.body.lojaId;if(!lojaId)return res.status(400).json({error:'lojaId_required'});
const ref=db.doc(`lojas/${lojaId}/operadores/${codigo}`);const snap=await ref.get();if(!snap.exists)return res.status(401).json({error:'invalid'});const o=snap.data();if(o.ativo===false||hash(senha,o.salt)!==o.senhaHash)return res.status(401).json({error:'invalid'});
const loja=await db.doc(`lojas/${lojaId}`).get();return res.json({token:token({lojaId,operadorId:codigo,nome:o.nome}),lojaId,lojaNome:loja.exists?(loja.data().nome||loja.data().razaoSocial||''):'',operadorId:codigo,nome:o.nome});}catch(e){console.error(e);return res.status(500).json({error:'server'})}}));
exports.products=onRequest((req,res)=>corsHandler(req,res,async()=>{try{const s=readToken(req.query.token);if(!s?.lojaId)return res.status(401).end();const snap=await db.collection(`lojas/${s.lojaId}/produtos`).get();const arr=snap.docs.map(d=>({id:d.id,...d.data()}));return res.json(arr)}catch(e){console.error(e);return res.status(500).end()}}));
exports.sale=onRequest((req,res)=>corsHandler(req,res,async()=>{if(req.method!=='POST')return res.status(405).end();try{const {token:t,itens,formaPagamento,valorRecebido}=req.body||{};const s=readToken(t);if(!s?.lojaId||s.operadorId===undefined)return res.status(401).end();if(!Array.isArray(itens)||!itens.length)return res.status(400).json({error:'empty'});
const saleRef=db.collection(`lojas/${s.lojaId}/vendas`).doc();await db.runTransaction(async tx=>{const products=[];for(const i of itens){const ref=db.doc(`lojas/${s.lojaId}/produtos/${i.produtoId}`);const snap=await tx.get(ref);if(!snap.exists)throw new Error('product');const p=snap.data();const estoque=Number(p.estoque??p.quantidade??0);if(estoque<Number(i.quantidade))throw new Error('stock');products.push({ref,p,qty:Number(i.quantidade)});}
for(const x of products){const estoque=Number(x.p.estoque??x.p.quantidade??0);tx.update(x.ref,{estoque:estoque-x.qty,quantidade:estoque-x.qty});}
tx.set(saleRef,{operadorId:s.operadorId,operadorNome:s.nome,itens,formaPagamento,valorRecebido:Number(valorRecebido||0),criadoEm:admin.firestore.FieldValue.serverTimestamp(),status:'finalizada'});});return res.json({numero:saleRef.id});}catch(e){console.error(e);return res.status(e.message==='stock'?409:500).json({error:e.message})}}));
