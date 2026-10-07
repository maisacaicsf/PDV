GESTOK PDV - VERSAO SEM CLOUD FUNCTIONS

O PDV e um projeto separado, mas usa o mesmo Firebase gestok-3bce2.

IMPORTANTE - PRIMEIRA CONFIGURACAO
1) No Gestok administrativo, substitua operadores/script.js pelo arquivo em PATCH-GESTOK/operadores/script.js.
2) Substitua firebase/firestore.rules pelo arquivo em PATCH-GESTOK/firebase/firestore.rules.
3) Publique SOMENTE as regras do Firestore pelo Firebase CLI (nao precisa Blaze):
   firebase deploy --only firestore:rules
4) No Firebase Console, verifique se Authentication > Sign-in method > Email/Password esta ATIVADO.
5) Crie um operador NOVO no Gestok. Operadores antigos que foram criados pela versao anterior nao possuem conta de autenticacao e precisam ser recriados.
6) Configure o ID da loja no config.js (LOJA_ID) ou abra o PDV como index.html?lojaId=ID_DA_LOJA.
7) Abra o index.html do PDV por um servidor local ou hospedagem. Ex.: VS Code Live Server.

NAO e necessario Cloud Functions para esta versao.
NAO e necessario outro Firebase.
NAO e necessario colocar o PDV dentro do projeto raiz.

Fluxo:
Gestok cria operador -> Firebase Authentication cria conta tecnica -> Firestore guarda vinculo -> PDV faz login direto no Firebase -> carrega produtos -> registra venda -> baixa estoque.
