// Roda um comando com o `.env` da raiz carregado no AMBIENTE do processo.
//
// Existe porque a cadeia do Tauri não lê `.env`: o Vite lê (só o que tem prefixo
// `VITE_`), o Next lê (o `web/next.config.ts` chama `loadEnvFile` na mão), mas o
// `tauri build`/`cargo` não leem nada. O sintoma é sempre o mesmo e sempre no
// fim de uma compilação de 10 minutos:
//
//   A public key has been found, but no private key.
//   Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.
//
// Uso: node scripts/with-env.mjs <comando> [args...]
//
// FRONTEIRA DE CONFIANÇA: aqui entra o `.env` INTEIRO, secrets inclusive — é o
// mesmo que o dev faria com `set -a && . ./.env`. O que impede um secret de
// vazar pro artefato não é este script:
//   • o `src-tauri/build.rs` tem allowlist e só assa no binário o que é público;
//   • o Vite só expõe pro bundle o que começa com `VITE_`;
//   • o `scripts/check-bundle.mjs` varre o bundle atrás de segredo.
// Nada é impresso aqui, nem nome nem valor.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("uso: node scripts/with-env.mjs <comando> [args...]");
  process.exit(2);
}

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
let carregadas = 0;
try {
  for (const linha of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith("#")) continue;
    const corte = texto.indexOf("=");
    if (corte <= 0) continue;
    const chave = texto.slice(0, corte).trim();
    // O ambiente REAL vence: no CI as variáveis vêm do runner e o `.env` não
    // existe. Aqui só preenchemos buraco.
    if (chave in process.env) continue;
    // Vazio ENTRA, ao contrário do build.rs: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD=`
    // significa "chave sem senha", e deixar a variável ausente faz o Tauri
    // parar pra perguntar a senha no meio do bundle.
    process.env[chave] = texto
      .slice(corte + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    carregadas += 1;
  }
  console.log(`with-env: ${carregadas} variável(is) do .env carregada(s)`);
} catch {
  // Sem `.env` (CI) o comando roda com o ambiente que já existe — que é o certo.
  console.log("with-env: sem .env; usando o ambiente do processo");
}

const filho = spawn(command, args, { stdio: "inherit", shell: true });
filho.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
filho.on("error", (erro) => {
  console.error(`with-env: não consegui rodar "${command}": ${erro.message}`);
  process.exit(1);
});
