GESTOK PDV - LOGIN POR TABELA DE OPERADORES

Esta versão NÃO usa Cloud Functions e NÃO precisa do plano Blaze para as Functions.
O PDV é um projeto separado, mas usa o mesmo Firebase do Gestok: gestok-3bce2.

1) NO FIREBASE
- Authentication > Sign-in method > ative Anonymous (Anônimo).
- Firestore > Rules: publique o arquivo PATCH-GESTOK/firebase/firestore.rules.
  Pela CLI, dentro da raiz do Gestok: firebase deploy --only firestore:rules

2) NO GESTOK
- Substitua o arquivo da tela de operadores pelo PATCH-GESTOK/operadores/script.js.
- O cadastro passa a gravar: codigo, nome, senhaHash, senhaSalt e ativo.
- Os operadores antigos precisam ser recriados, pois não possuem senhaHash/senhaSalt.

3) NO PDV
- Abra config.js e preencha LOJA_ID com o ID da loja do Gestok.
- Exemplo: export const LOJA_ID="abc123";
- O PDV consulta diretamente lojas/LOJA_ID/operadores/CODIGO.

4) TESTE
- Crie um NOVO operador no Gestok.
- Anote o código de 4 dígitos.
- Abra o PDV e informe código + senha.
- O nome do operador aparecerá no caixa.

IMPORTANTE DE SEGURANÇA
Esta solução é uma versão simples/protótipo: a conferência da senha ocorre no cliente após ler o hash/salt do operador. Para produção/SaaS em escala, o ideal é voltar para uma autenticação server-side (Cloud Functions/Cloud Run) ou Firebase Authentication com conta própria por operador. Não use esta regra como modelo definitivo para um sistema fiscal ou de alta criticidade.


CORREÇÃO IMPORTANTE
O PDV agora preserva uma autenticação não-anônima já existente do Gestok no mesmo domínio/origem. Ele só usa autenticação anônima quando não há usuário autenticado. Isso evita que abrir o PDV deslogue/substitua a sessão do Gestok.
