GESTOK PDV — VERSÃO 6 (segura, com baixa de estoque correta e cupom não fiscal)

O QUE MUDOU
- Finalizar venda corrigido. A versão anterior lia e gravava produtos dentro do mesmo loop da
  transação (o Firestore proíbe ler depois de gravar). Por isso vendas com 2 ou mais produtos falhavam.
  Agora o servidor lê tudo primeiro e só depois grava.
- Baixa correta: atualiza "quantidade" do produto e registra a movimentação de Saída (motivo "Venda PDV"),
  igual ao Gestok. As vendas passam a aparecer no histórico de movimentações e nos relatórios.
- Preço e total são calculados no servidor (o navegador não consegue alterar o valor da venda).
- Login do operador conferido no servidor, com bloqueio de 5 minutos após 5 senhas erradas.
- Respeita a assinatura do Gestok: se estiver vencida, o PDV não vende.
- Numeração sequencial das vendas e comprovante NÃO FISCAL para imprimir.
- Produtos por KG aceitam quantidade decimal (clique no número da quantidade para digitar).
- Atalhos: F2 buscar · F9 finalizar · Enter no campo "valor recebido" finaliza · ESC cancela.
- O PDV NÃO usa mais login anônimo nem acessa o Firestore direto. As regras do Firestore do Gestok
  continuam fechadas. NÃO publique regras abertas para o PDV.

COMO COLOCAR PARA FUNCIONAR
1) Confira config.js: LOJA_ID deve ser o ID do documento da sua loja em Firestore > lojas.
2) Instale o Node.js e o Firebase CLI:  npm install -g firebase-tools   e depois:  firebase login
3) Dentro desta pasta:
     cd functions
     npm install
     cd ..
     firebase deploy --only functions:pdv
   (precisa do plano Blaze do Firebase; se perguntar sobre apagar outras funções, responda NÃO)
4) Abra o PDV por um servidor (ex.: VS Code Live Server ou Firebase Hosting:  firebase deploy --only hosting).
5) Os operadores continuam sendo criados no Gestok (menu Operadores). Operadores criados no formato
   antigo (sem senhaSalt) precisam ser criados de novo.

OBSERVAÇÕES
- As regras do Firestore devem ser as do Gestok (arquivo firestore.rules do Gestok corrigido).
  A pasta PATCH-GESTOK e o firestore.rules antigo deste projeto foram removidos de propósito:
  eles liberavam leitura/escrita demais.
- Se você ativou o login "Anônimo" no Firebase Authentication só para o PDV, pode desativá-lo.
