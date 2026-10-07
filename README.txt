GESTOK PDV - v4

CORREÇÃO:
O Gestok não usa o campo "estoque" nos produtos. O campo correto é "quantidade".
O PDV foi ajustado para mostrar, validar e baixar estoque usando "quantidade".

Também foi ajustada a regra do Firestore para permitir ao PDV anônimo diminuir "quantidade" e atualizar "dataAtualizacao".

Configuração:
- config.js: defina LOJA_ID com o ID da loja.
- Firebase Authentication: Anonymous deve estar habilitado.
