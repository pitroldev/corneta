import { ScanEye } from "lucide-react";
import { rich, useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";

/** Editor da watchlist do Guardião: contagem positiva + trim/dedup no blur. */
export function GuardianEditor() {
  const { t, tp } = useI18n();
  const settings = useStore((s) => s.config!.settings);
  const setSettings = useStore((s) => s.setSettings);
  const watchCount = settings.guardianWatchlist.filter(
    (term) => term.trim().length >= 3,
  ).length;
  // Termos de 1–2 letras são descartados pelo motor — avisar em vez de fingir proteção.
  const shortTerms = settings.guardianWatchlist
    .map((term) => term.trim())
    .filter((term) => term.length > 0 && term.length < 3);

  return (
    <div className="flex flex-col gap-3 py-3.5">
      <div className="rounded-md border-2 border-brass/40 bg-brass/[0.06] p-3 text-xs leading-relaxed text-ink-muted">
        <div className="mb-1 font-display text-sm font-extrabold text-ink">
          {t("settings.guardian.cost.title")}
        </div>
        {rich(t, "settings.guardian.cost.intro", {
          // Nome próprio da tela: não traduz, mesma string nos dois idiomas.
          jaVolto: (
            <strong className="text-ink">
              {t("golive.bar.protection.brb")}
            </strong>
          ),
        })}
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            {rich(t, "settings.guardian.cost.delay", {
              delay: (
                <strong className="text-ink">
                  {t("settings.guardian.cost.delay.value")}
                </strong>
              ),
            })}
          </li>
          <li>{t("settings.guardian.cost.chat")}</li>
          <li>
            {rich(t, "settings.guardian.cost.scope", {
              no: (
                <strong className="text-ink">
                  {t("settings.guardian.cost.scope.no")}
                </strong>
              ),
            })}
          </li>
          <li>{t("settings.guardian.cost.smallText")}</li>
        </ul>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-ink-muted">
          {t("settings.guardian.list.label")}{" "}
          <span className="font-normal text-ink-faint">
            {t("settings.guardian.list.hint")}
          </span>
        </span>
        <textarea
          value={settings.guardianWatchlist.join("\n")}
          onChange={(e) =>
            setSettings({ guardianWatchlist: e.target.value.split("\n") })
          }
          onBlur={() =>
            setSettings({
              guardianWatchlist: Array.from(
                new Set(
                  settings.guardianWatchlist
                    .map((term) => term.trim())
                    .filter(Boolean),
                ),
              ),
            })
          }
          rows={4}
          placeholder={t("settings.guardian.list.placeholder")}
          className="resize-y rounded-md border-2 border-border bg-surface px-2 py-1.5 text-sm font-medium text-ink outline-none focus:border-brass"
        />
        {/* A frase inteira vem do dicionário, pelo tp(): o singular não é a
            mesma costura em todo idioma, e "termo(s)" é remendo, não texto.
            {terms} chega com as aspas já postas. */}
        {watchCount === 0 ? (
          <span className="text-xs font-semibold text-brass">
            {t("settings.guardian.list.empty")}
          </span>
        ) : shortTerms.length > 0 ? (
          <span className="text-xs font-semibold text-brass">
            {shortTerms.length === 1
              ? tp("settings.guardian.list.watchingOneShort", watchCount, {
                  terms: `"${shortTerms[0]}"`,
                })
              : tp("settings.guardian.list.watchingManyShort", watchCount, {
                  short: shortTerms.length,
                  terms: shortTerms.map((term) => `"${term}"`).join(", "),
                })}
          </span>
        ) : (
          <span className="text-xs font-semibold text-ok">
            {tp("settings.guardian.list.watching", watchCount)}
          </span>
        )}
      </label>
    </div>
  );
}

export function GuardianPreview() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-1.5 bg-surface-2 px-2.5">
      <div className="h-1.5 w-4/5 rounded-full bg-ink-faint/40" />
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1/5 rounded-full bg-ink-faint/40" />
        <div className="h-3 flex-1 rounded-sm bg-night" />
      </div>
      <div className="h-1.5 w-3/5 rounded-full bg-ink-faint/40" />
      <ScanEye
        className="absolute right-1.5 top-1.5 size-3.5 text-brass"
        strokeWidth={2.4}
      />
    </div>
  );
}
