import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "./i18n/en";
import { pt } from "./i18n/pt";
import { LEGAL_ACCEPT_VERSION, LEGAL_UPDATED_ISO } from "./legal";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );
}

describe("public product claims", () => {
  it("separates uninstalling, disconnecting, revocation and vault cleanup in both languages", () => {
    const ptPrivacy = source(
      "../app/(legal)/[locale]/legal/_content/privacy.pt.tsx",
    );
    const enPrivacy = source(
      "../app/(legal)/[locale]/legal/_content/privacy.en.tsx",
    );
    const ptCopy = pt["steps.accounts.privacy.text"];
    const enCopy = en["steps.accounts.privacy.text"];

    for (const text of [ptCopy, ptPrivacy]) {
      expect(text).toMatch(/desconecte suas contas na Corneta/i);
      expect(text).toMatch(/revogue o acesso nas plataformas/i);
      expect(text).toMatch(/desinstalar (?:o aplicativo )?não garante/i);
      expect(text).not.toMatch(/desinstalar o app apaga|some ao desinstalar/i);
      expect(text).not.toContain("A revogação vale imediatamente");
    }
    for (const text of [enCopy, enPrivacy]) {
      expect(text).toMatch(/disconnect your accounts in Corneta/i);
      expect(text).toMatch(/revoke access on the platforms/i);
      expect(text).toMatch(/uninstalling (?:the app )?does not guarantee/i);
      expect(text).not.toMatch(/uninstalling the app wipes|vault goes away/i);
      expect(text).not.toContain("Revocation takes effect immediately");
    }
    expect(ptPrivacy).toContain("Gerenciador de Credenciais do Windows");
    expect(ptPrivacy).toContain("não apague credenciais de outros aplicativos");
    expect(ptPrivacy).toContain("a limpeza pode estar incompleta");
    expect(enPrivacy).toContain("Windows Credential Manager");
    expect(enPrivacy).toContain("do not delete other apps’ credentials");
    expect(enPrivacy).toContain("cleanup may be incomplete");

    const service = source("../../src-tauri/src/keys.rs").match(
      /const SERVICE: &str = "([^"]+)";/,
    )?.[1];
    expect(service).toBe("br.com.pitroldev.corneta");
    expect(ptPrivacy).toContain(`<code>${service}</code>`);
    expect(enPrivacy).toContain(`<code>${service}</code>`);
  });

  it("keeps the factual privacy correction separate from acceptance versioning", () => {
    expect(LEGAL_UPDATED_ISO >= "2026-09-07").toBe(true);
    expect(LEGAL_ACCEPT_VERSION).toBe("2026-08-01");
  });

  it.each([
    ["pt", pt],
    ["en", en],
  ] as const)(
    "does not claim undocumented platform validation in %s",
    (locale, dict) => {
      const copy = Object.values(dict).join(" ");
      const terms = source(
        `../app/(legal)/[locale]/legal/_content/terms.${locale}.tsx`,
      );

      for (const text of [copy, terms]) {
        expect(text).not.toMatch(/transmissão real documentada/i);
        expect(text).not.toMatch(/documented (?:real|end-to-end) stream/i);
        expect(text).not.toMatch(/documented a real stream/i);
      }
    },
  );

  it("asks users to verify their own destinations in both languages", () => {
    expect(pt["steps.platforms.note.validation"]).toContain(
      "Teste cada destino com a sua conta e configuração",
    );
    expect(en["steps.platforms.note.validation"]).toContain(
      "Test each destination with your account and setup",
    );
    expect(
      source("../app/(legal)/[locale]/legal/_content/terms.pt.tsx"),
    ).toContain("Faça um teste prévio com cada destino");
    expect(
      source("../app/(legal)/[locale]/legal/_content/terms.en.tsx"),
    ).toContain("Test each destination beforehand");
  });

  it("uses the same platform disclosure in llms.txt and the landing page", () => {
    const llms = source("../app/llms.txt/route.ts");
    expect(llms).toContain('t("chrome.llms.platforms.body")');
    expect(llms).toContain('t("steps.platforms.note.validation")');
    expect(llms).not.toMatch(/transmissão real documentada/i);
    expect(source("../app/_sections/steps.tsx")).toContain(
      't("steps.platforms.note.validation")',
    );
  });

  it("distinguishes RTMP input from the OBS-only integration", () => {
    const product = source("../PRODUCT.md");
    expect(product).not.toContain("Requer OBS para produzir a transmissão");
    expect(product).toContain(
      "Requer uma fonte de vídeo/áudio compatível com RTMP",
    );
    expect(product).toContain("O OBS é recomendado, mas não obrigatório");
    expect(product).toContain("A configuração automática");
    expect(product).toContain(
      "as estatísticas integradas são específicos do OBS",
    );
    const ptTerms = source(
      "../app/(legal)/[locale]/legal/_content/terms.pt.tsx",
    );
    const enTerms = source(
      "../app/(legal)/[locale]/legal/_content/terms.en.tsx",
    );
    expect(ptTerms).toContain("outro programa compatível com RTMP");
    expect(ptTerms).not.toContain("depende do OBS para produzir");
    expect(enTerms).toContain("another RTMP-compatible streaming app");
    expect(enTerms).not.toContain("depends on OBS to produce");
  });

  it("discloses the experimental guard's fail-closed video and uncensored audio", () => {
    const ptTerms = source(
      "../app/(legal)/[locale]/legal/_content/terms.pt.tsx",
    );
    const enTerms = source(
      "../app/(legal)/[locale]/legal/_content/terms.en.tsx",
    );
    for (const text of [pt["protection.guard.privacy.body"], ptTerms]) {
      expect(text).toContain("imagens não verificadas também ficam cobertas");
      expect(text).toContain("falhar ou ficar atrasada");
      expect(text).toContain("automaticamente");
    }
    for (const text of [en["protection.guard.privacy.body"], enTerms]) {
      expect(text).toContain("Unverified images also stay covered");
      expect(text).toContain("fails or falls behind");
      expect(text).toContain("automatically");
    }
    for (const text of [pt["protection.guard.privacy.cost"], ptTerms]) {
      expect(text).toContain("pode deixar passar termos");
      expect(text).toContain("não censura o áudio");
    }
    for (const text of [en["protection.guard.privacy.cost"], enTerms]) {
      expect(text).toContain("can miss terms");
      expect(text).toContain("not censor audio");
    }
    expect(pt["protection.guard.privacy.switch"]).toBe("experimental");
    expect(en["protection.guard.privacy.switch"]).toBe("experimental");
    expect(pt["protection.guard.privacy.cost"]).not.toContain("o chat também");
    expect(en["protection.guard.privacy.cost"]).not.toContain("the chat too");
  });

  it("documents the fixed WebSocket port used by the OBS integration", () => {
    const native = source("../../src-tauri/src/commands.rs");
    const port = native.match(/const OBS_WS_PORT: u16 = (\d+);/)?.[1];
    const guide = source(
      "../content/pt-BR/help/streaming-software/automatic-obs-setup.mdx",
    );
    expect(port).toBeDefined();
    expect(guide).toContain(`mantenha a porta \`${port}\``);
    expect(guide).not.toContain("só mude se você já usa outra configuração");
  });

  it("starts Corneta before asking OBS to send the first manual stream", () => {
    const guide = source(
      "../content/pt-BR/help/getting-started/first-stream.mdx",
    )
      .split("## Envie o sinal do OBS")[1]
      ?.split("## Confira antes")[0];
    expect(guide).toBeDefined();
    expect(guide).toContain("clique em **BORA AO VIVO** para preparar");
    expect(guide).toContain("**Iniciar transmissão** no OBS depois do BORA");
    expect(guide).toContain("Se o início automático estiver habilitado");
  });
});
