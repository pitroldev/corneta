import { describe, expect, it } from "vitest";
import { buildI18n } from "./i18n/core";
import { en } from "./i18n/en";
import { pt } from "./i18n/pt";
import { markFeedback } from "./markMoment";

const ptI18n = buildI18n("pt-BR", pt);
const enI18n = buildI18n("en", en);

describe("markFeedback", () => {
  it("keeps the plain report message when no platform was asked", () => {
    expect(markFeedback([], ptI18n)).toEqual({
      success: pt["golive.toast.markerSaved"],
      warnings: [],
    });
  });

  it("names the platform with its Portuguese preposition and the plain name in English", () => {
    const marks = [{ platform: "twitch", outcome: "marked" as const }];
    expect(markFeedback(marks, ptI18n).success).toBe(
      "Marquei o momento 📍 — tá no relatório e no VOD da Twitch",
    );
    expect(markFeedback(marks, enI18n).success).toBe(
      "Dropped a marker 📍 — it's in the report and in the VOD on Twitch",
    );
  });

  it("warns once per refusing platform while the report marker still counts", () => {
    const feedback = markFeedback(
      [
        { platform: "twitch", outcome: "unavailable" },
        { platform: "kick", outcome: "reconnect" },
        { platform: "youtube", outcome: "failed" },
      ],
      ptI18n,
    );
    expect(feedback.success).toBe(pt["golive.toast.markerSaved"]);
    expect(feedback.warnings).toEqual([
      "Não deu pra marcar no VOD da Twitch: só dá quando a live fica salva no canal (VOD ligado). No relatório ficou.",
      "Não deu pra marcar no VOD da Kick: reconecte a conta em Plataformas. No relatório ficou.",
      "Não deu pra marcar no VOD do YouTube agora. No relatório ficou.",
    ]);
  });
});
