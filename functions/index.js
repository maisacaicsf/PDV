/**
 * GESTOK PDV — API segura (Cloud Functions)
 *
 * O PDV não acessa o Firestore diretamente: tudo passa por aqui.
 *  - pdvLogin    confere código + senha do operador NO SERVIDOR e devolve um token assinado
 *  - pdvProdutos lista os produtos ativos da loja do operador
 *  - pdvVenda    finaliza a venda: valida estoque, calcula o total com o preço do banco,
 *                dá baixa em "quantidade" e registra a movimentação de Saída (como o Gestok faz)
 */
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const OPCOES = { region: 'us-central1', cors: true, maxInstances: 10, timeoutSeconds: 30 };
const SESSAO_MS = 12 * 60 * 60 * 1000;
const FORMAS = ['dinheiro', 'pix', 'debito', 'credito'];
const ID_LOJA = /^[A-Za-z0-9]{10,40}$/;

class ErroPDV extends Error {
  constructor(http, codigo, mensagem) {
    super(mensagem || codigo);
    this.http = http;
    this.codigo = codigo;
  }
}

/* ---------- segredo e token (HMAC) ---------- */
let segredoCache = null;
async function segredo() {
  if (segredoCache) return segredoCache;
  const ref = db.doc('sistema/pdv'); // coleção fechada para clientes (só o Admin SDK lê)
  let snap = await ref.get();
  if (!snap.exists || !snap.data().segredo) {
    try {
      await ref.create({ segredo: crypto.randomBytes(32).toString('hex'), criadoEm: FieldValue.serverTimestamp() });
    } catch (e) { /* outra instância criou ao mesmo tempo */ }
    snap = await ref.get();
  }
  segredoCache = snap.data().segredo;
  return segredoCache;
}

async function assinar(payload) {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', await segredo()).update(corpo).digest('base64url');
  return `${corpo}.${sig}`;
}

async function lerSessao(req) {
  const cab = req.get('authorization') || '';
  const token = cab.startsWith('Bearer ') ? cab.slice(7) : '';
  const [corpo, sig] = token.split('.');
  const invalida = new ErroPDV(401, 'sessao', 'Sessão inválida. Entre novamente.');
  if (!corpo || !sig) throw invalida;
  const esperado = crypto.createHmac('sha256', await segredo()).update(corpo).digest();
  const recebido = Buffer.from(sig, 'base64url');
  if (recebido.length !== esperado.length || !crypto.timingSafeEqual(recebido, esperado)) throw invalida;
  let dados;
  try { dados = JSON.parse(Buffer.from(corpo, 'base64url').toString()); } catch (e) { throw invalida; }
  if (!dados.lojaId || !dados.operadorId || !(dados.exp > Date.now())) {
    throw new ErroPDV(401, 'sessao', 'Sessão expirada. Entre novamente.');
  }
  return dados;
}

/* ---------- utilidades ---------- */
function hashConfere(op, senha) {
  const salt = op.senhaSalt || op.salt;
  if (!salt || !op.senhaHash) return false;
  const calc = Buffer.from(crypto.createHash('sha256').update(`${salt}:${senha}`).digest('hex'));
  const guardado = Buffer.from(String(op.senhaHash));
  return calc.length === guardado.length && crypto.timingSafeEqual(calc, guardado);
}

function dataDe(v) {
  if (!v) return null;
  const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// Mesma regra do front do Gestok: teste grátis ou assinatura paga, ainda dentro do vencimento.
function assinaturaValida(loja) {
  const a = loja && loja.assinatura;
  if (!a) return false;
  const venc = dataDe(a.vencimento);
  if (!venc || venc.getTime() <= Date.now()) return false;
  return (a.status === 'teste_gratis' && a.pagamento === 'gratis') ||
         (a.status === 'ativa' && a.pagamento === 'aprovado');
}

function rota(metodo, fn) {
  return onRequest(OPCOES, async (req, res) => {
    if (req.method !== metodo) return res.status(405).json({ erro: 'metodo' });
    try {
      res.json(await fn(req));
    } catch (e) {
      if (e instanceof ErroPDV) return res.status(e.http).json({ erro: e.codigo, mensagem: e.message });
      console.error(e);
      res.status(500).json({ erro: 'servidor', mensagem: 'Erro interno. Tente novamente.' });
    }
  });
}

const arred3 = (n) => Math.round(n * 1000) / 1000;

/* ---------- LOGIN ---------- */
exports.pdvLogin = rota('POST', async (req) => {
  const { lojaId, codigo, senha } = req.body || {};
  if (!ID_LOJA.test(String(lojaId || '')) || !/^\d{4}$/.test(String(codigo || '')) ||
      typeof senha !== 'string' || !senha || senha.length > 128) {
    throw new ErroPDV(400, 'dados', 'Informe o código de 4 dígitos e a senha.');
  }
  const lojaRef = db.doc(`lojas/${lojaId}`);
  const opRef = lojaRef.collection('operadores').doc(codigo);
  const [lojaSnap, opSnap] = await Promise.all([lojaRef.get(), opRef.get()]);
  const invalido = new ErroPDV(401, 'credenciais', 'Código ou senha inválidos.');
  if (!lojaSnap.exists || !opSnap.exists) throw invalido;

  const op = opSnap.data();
  if (op.bloqueadoAte && op.bloqueadoAte > Date.now()) {
    throw new ErroPDV(429, 'bloqueado', 'Muitas tentativas erradas. Aguarde alguns minutos.');
  }
  if (!hashConfere(op, senha)) {
    const falhas = (op.falhas || 0) + 1;
    await opRef.update(falhas >= 5 ? { falhas: 0, bloqueadoAte: Date.now() + 5 * 60 * 1000 } : { falhas });
    throw invalido;
  }
  if (op.ativo === false) throw new ErroPDV(403, 'inativo', 'Este operador está inativo.');

  const loja = lojaSnap.data();
  if (!assinaturaValida(loja)) {
    throw new ErroPDV(402, 'assinatura', 'A assinatura desta loja está vencida. Renove no Gestok.');
  }
  if (op.falhas || op.bloqueadoAte) await opRef.update({ falhas: 0, bloqueadoAte: FieldValue.delete() });

  const nome = op.nome || 'Operador';
  const exp = Date.now() + SESSAO_MS;
  return {
    token: await assinar({ lojaId, operadorId: codigo, nome, exp }),
    lojaId, lojaNome: loja.nome || loja.razaoSocial || '', operadorId: codigo, nome, exp
  };
});

/* ---------- PRODUTOS ---------- */
exports.pdvProdutos = rota('GET', async (req) => {
  const s = await lerSessao(req);
  const snap = await db.collection(`lojas/${s.lojaId}/produtos`).get();
  const produtos = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.ativo !== false)
    .map((p) => ({
      id: p.id,
      nome: p.nome || '',
      codigo: p.codigo || '',
      categoria: p.categoria || '',
      unidade: p.unidade || 'UN',
      preco: Number(p.preco || 0),
      quantidade: Number(p.quantidade ?? p.estoque ?? 0)
    }));
  return { produtos };
});

/* ---------- VENDA ---------- */
exports.pdvVenda = rota('POST', async (req) => {
  const s = await lerSessao(req);
  const { itens, formaPagamento, valorRecebido } = req.body || {};

  if (!FORMAS.includes(formaPagamento)) throw new ErroPDV(400, 'pagamento', 'Forma de pagamento inválida.');
  if (!Array.isArray(itens) || !itens.length || itens.length > 100) throw new ErroPDV(400, 'itens', 'Venda sem itens.');

  const pedido = new Map(); // junta o mesmo produto repetido
  for (const i of itens) {
    const id = String((i && i.produtoId) || '');
    const q = Number(i && i.quantidade);
    if (!id || id.includes('/') || !Number.isFinite(q) || q <= 0) throw new ErroPDV(400, 'itens', 'Item inválido na venda.');
    pedido.set(id, (pedido.get(id) || 0) + q);
  }
  const ids = [...pedido.keys()];

  const lojaRef = db.doc(`lojas/${s.lojaId}`);
  const opRef = lojaRef.collection('operadores').doc(s.operadorId);
  const contRef = lojaRef.collection('contadores').doc('vendas');
  const vendaRef = lojaRef.collection('vendas').doc();
  const prodRefs = ids.map((id) => lojaRef.collection('produtos').doc(id));
  const recebidoInformado = Math.round(Number(valorRecebido || 0) * 100);

  return db.runTransaction(async (tx) => {
    // 1) TODAS as leituras primeiro (exigência do Firestore)
    const [lojaSnap, opSnap, contSnap, ...prodSnaps] = await tx.getAll(lojaRef, opRef, contRef, ...prodRefs);

    if (!lojaSnap.exists || !assinaturaValida(lojaSnap.data())) {
      throw new ErroPDV(402, 'assinatura', 'A assinatura desta loja está vencida.');
    }
    if (!opSnap.exists || opSnap.data().ativo === false) {
      throw new ErroPDV(403, 'inativo', 'Operador inativo. Entre novamente.');
    }
    const op = opSnap.data();
    const numero = (contSnap.exists ? Number(contSnap.data().ultimo || 0) : 0) + 1;
    const agora = Timestamp.now();

    // 2) Validações e cálculo (preço sempre vindo do banco)
    let totalCent = 0;
    const linhas = prodSnaps.map((ps, idx) => {
      if (!ps.exists) throw new ErroPDV(404, 'produto', 'Um produto da venda não existe mais.');
      const p = ps.data();
      if (p.ativo === false) throw new ErroPDV(409, 'produto', `Produto inativo: ${p.nome}`);
      const unidade = p.unidade || 'UN';
      const q = unidade === 'KG' ? arred3(pedido.get(ids[idx])) : pedido.get(ids[idx]);
      if (!(q > 0) || (unidade !== 'KG' && !Number.isInteger(q))) {
        throw new ErroPDV(400, 'quantidade', `Quantidade inválida: ${p.nome}`);
      }
      const preco = Number(p.preco || 0);
      if (!(preco > 0)) throw new ErroPDV(409, 'preco', `Produto sem preço cadastrado: ${p.nome}`);
      const estoque = Number(p.quantidade ?? p.estoque ?? 0);
      if (q > estoque + 1e-9) {
        throw new ErroPDV(409, 'estoque', `Estoque insuficiente: ${p.nome} (disponível: ${estoque})`);
      }
      const totalItem = Math.round(preco * q * 100);
      totalCent += totalItem;
      return { ref: ps.ref, p, q, preco, unidade, estoque, novo: arred3(estoque - q), totalItem };
    });

    const recebidoCent = formaPagamento === 'dinheiro' ? recebidoInformado : totalCent;
    if (recebidoCent < totalCent) throw new ErroPDV(400, 'recebido', 'O valor recebido é menor que o total.');
    const trocoCent = recebidoCent - totalCent;

    // 3) Escritas: baixa do estoque + movimentação de Saída (mesmo formato do Gestok)
    linhas.forEach((l) => {
      const atualizacao = {
        quantidade: l.novo,
        dataAtualizacao: FieldValue.serverTimestamp(),
        ultimaSaida: {
          quantidade: l.q, estoqueAnterior: l.estoque, estoqueNovo: l.novo,
          motivo: 'Venda PDV', observacao: `Venda nº ${numero}`, data: agora
        }
      };
      if (l.p.quantidade === undefined && l.p.estoque !== undefined) atualizacao.estoque = l.novo;
      tx.update(l.ref, atualizacao);

      tx.set(lojaRef.collection('movimentacoes').doc(), {
        tipo: 'Saída',
        produtoId: l.ref.id,
        produto: l.p.nome || '',
        codigo: l.p.codigo || '',
        quantidade: l.q,
        unidade: l.unidade,
        estoqueAnterior: l.estoque,
        estoqueNovo: l.novo,
        motivo: 'Venda PDV',
        observacao: `Venda nº ${numero} — ${op.nome || 'Operador'}`,
        usuarioUid: '',
        lojaId: s.lojaId,
        origem: 'PDV',
        vendaId: vendaRef.id,
        operadorId: s.operadorId,
        data: agora
      });
    });

    tx.set(contRef, { ultimo: numero }, { merge: true });
    tx.set(vendaRef, {
      numero,
      lojaId: s.lojaId,
      operadorId: s.operadorId,
      operadorNome: op.nome || '',
      formaPagamento,
      itens: linhas.map((l) => ({
        produtoId: l.ref.id, nome: l.p.nome || '', codigo: l.p.codigo || '', unidade: l.unidade,
        quantidade: l.q, preco: l.preco, total: l.totalItem / 100
      })),
      valorTotal: totalCent / 100,
      valorRecebido: recebidoCent / 100,
      troco: trocoCent / 100,
      status: 'finalizada',
      criadoEm: FieldValue.serverTimestamp()
    });

    return {
      numero,
      valorTotal: totalCent / 100,
      valorRecebido: recebidoCent / 100,
      troco: trocoCent / 100,
      data: agora.toMillis(),
      itens: linhas.map((l) => ({
        nome: l.p.nome || '', codigo: l.p.codigo || '', unidade: l.unidade,
        quantidade: l.q, preco: l.preco, total: l.totalItem / 100
      }))
    };
  });
});
