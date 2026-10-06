// CONFIGURAÇÃO DO GESTOK PDV
// O PDV é um projeto independente, mas usa o mesmo Firebase do Gestok.
export const firebaseConfig={apiKey:"AIzaSyBe-v8J4VFoGHbIWGTRJevsD2wWztITyNU",authDomain:"gestok-3bce2.firebaseapp.com",projectId:"gestok-3bce2",storageBucket:"gestok-3bce2.firebasestorage.app",messagingSenderId:"666747184098",appId:"1:666747184098:web:383688a3c974c00ff30fbb",measurementId:"G-DP56ENDWDV"};

// Se o PDV estiver hospedado no Firebase Hosting, pode usar "/api".
// Ao abrir o index.html diretamente no computador, use a URL das Functions.
export const PDV_API="https://us-central1-gestok-3bce2.cloudfunctions.net";

// Opcional: deixe vazio e o PDV tentará descobrir a loja pelo localStorage
// ou pelo parâmetro ?lojaId=... da URL. Para uma instalação fixa,
// você pode colocar aqui o ID da loja.
export const LOJA_ID="";
