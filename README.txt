GESTOK PDV - PROJETO INDEPENDENTE

Este projeto é separado do código raiz do Gestok administrativo.
Ele usa o mesmo projeto Firebase, mas tem seu próprio código.

IMPORTANTE PARA TESTE LOCAL:
1. As Functions precisam estar publicadas no projeto Firebase.
2. O terminal precisa saber qual loja atende. Você pode:
   - preencher LOJA_ID no config.js; ou
   - abrir index.html?lojaId=SEU_ID_DA_LOJA; ou
   - deixar o Gestok administrativo gravar gestok_conta no mesmo localStorage/origem quando aplicável.

PARA PUBLICAR:
- firebase login
- firebase deploy --only functions

Se o PDV for publicado no Firebase Hosting, também pode ser usado com as rotas /api configuradas no firebase.json.
