GESTOK PDV - VERSÃO 5

Correção: ao finalizar a venda, o PDV agora lê o estoque atual do campo quantidade (padrão do Gestok), com compatibilidade de leitura para o campo estoque caso algum produto antigo ainda o utilize. A baixa é gravada no campo quantidade.

Projeto separado do Gestok, usando o mesmo projeto Firebase. Confira config.js e o LOJA_ID antes de usar.

Atenção: as regras Firestore devem permitir ao usuário anônimo do PDV ler operadores e produtos, atualizar apenas quantidade/dataAtualizacao nos produtos e criar vendas.
