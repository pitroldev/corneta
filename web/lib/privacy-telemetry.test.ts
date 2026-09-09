import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TELEMETRY_NOTICE_VERSION } from "../../src/lib/telemetry-schema";
import { pt } from "../../src/lib/i18n/pt";
import { en } from "../../src/lib/i18n/en";

function privacySource(locale: "pt" | "en") {
  return readFileSync(
    new URL(
      `../app/(legal)/[locale]/legal/_content/privacy.${locale}.tsx`,
      import.meta.url,
    ),
    "utf8",
  ).replace(/\s+/g, " ");
}

describe("public telemetry disclosure parity", () => {
  it("separates usage activation from the crash default in Portuguese", () => {
    const source = privacySource("pt");
    expect(source).toContain("dados de uso só são enviados se você ativar");
    expect(source).toContain("uso fica desligado e falhas ficam ligadas");
    expect(source).toContain("Suas escolhas anteriores são mantidas");
    expect(source).toContain(
      "Ativar uso não envia eventos anteriores à ativação",
    );
    expect(source).toContain("Consentimento para dados de uso");
    expect(source).toContain("Legítimo interesse para relatos de falhas");
    expect(source).toContain("aviso não ativa dados de uso");
    expect(source).toContain("Desligar não desfaz uma requisição já iniciada");
    expect(source).not.toContain("independentes, ligadas por padrão");
    expect(source).not.toContain(
      "os dados de uso e os relatórios automáticos de falha do aplicativo vêm ligados",
    );
    expect(source).not.toContain("UUID nasce somente ao ativar");
  });

  it("describes the same independent choices in English", () => {
    const source = privacySource("en");
    expect(source).toContain("usage data is sent only if you enable it");
    expect(source).toContain("usage is off and crash reports are on");
    expect(source).toContain("Your previous choices are kept");
    expect(source).toContain("does not send events from before activation");
    expect(source).toContain("Consent for usage data");
    expect(source).toContain("Legitimate interest for crash reports");
    expect(source).toContain("closing the notice does not enable usage data");
    expect(source).toContain("does not undo a request already in flight");
    expect(source).not.toContain("and both start on");
    expect(source).not.toContain(
      "app usage data and automatic crash reports start on",
    );
    expect(source).not.toContain("UUID is created only after you enable");
  });

  it.each(["pt", "en"] as const)(
    "keeps the separate website opt-out in %s",
    (locale) => {
      const source = privacySource(locale);
      expect(source).toContain("corneta:site-telemetry:v1");
      expect(source).toContain("Do Not Track");
      expect(source).toContain("Global Privacy Control");
      expect(source).toContain("<TelemetryPreference locale={L} />");
    },
  );

  it("keeps the publication gate aligned with the desktop notice", () => {
    const source = readFileSync(
      new URL("../../scripts/check-telemetry-release.mjs", import.meta.url),
      "utf8",
    );
    const version = source.match(
      /const EXPECTED_NOTICE_VERSION = "([^"]+)";/,
    )?.[1];
    expect(version).toBe(TELEMETRY_NOTICE_VERSION);
  });

  it.each([
    {
      locale: "pt",
      dictionary: pt,
      defaults:
        "dados de uso ficam desligados e relatos de falhas ficam ligados",
      previous: "Suas escolhas anteriores são mantidas",
      futureOnly: "nem eventos anteriores à ativação",
      obsolete: "Já estou mandando",
    },
    {
      locale: "en",
      dictionary: en,
      defaults: "usage data is off and crash reports are on",
      previous: "Your previous choices are kept",
      futureOnly: "or events from before you enabled it",
      obsolete: "I'm already sending",
    },
  ])(
    "keeps the $locale desktop notice neutral about previous choices",
    ({ dictionary, defaults, previous, futureOnly, obsolete }) => {
      expect(dictionary["components.telemetry.notice.subtitle"]).toContain(
        defaults,
      );
      expect(dictionary["components.telemetry.notice.subtitle"]).toContain(
        previous,
      );
      expect(dictionary["components.telemetry.usage.body"]).toContain(
        futureOnly,
      );
      expect(dictionary["components.telemetry.notice.title"]).not.toContain(
        obsolete,
      );
    },
  );
});
