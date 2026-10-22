import { useState } from "react";
import { Button, Input, PlatformGlyph } from "../../components/ui";
import { bold, useT } from "../../lib/i18n";
import { toast } from "../../lib/toast";
import { openExternal } from "../../lib/utils";
import { sanitizeToken } from "../../lib/validation";
import {
  ByokModeActions,
  type ByokModes,
} from "../../screens/chat/AccountSettings";
import { splitAt } from "../../screens/chat/primitives";
import { useAccountAction } from "../../screens/chat/useAccountAction";

export function YoutubeCredsForm({
  onSave,
  modes,
  onUseOfficial,
  onUseSaved,
  onForget,
}: {
  onSave: (clientId: string, clientSecret: string) => Promise<void>;
  modes?: ByokModes;
  onUseOfficial?: () => void;
  onUseSaved?: () => void;
  onForget?: () => void;
}) {
  const t = useT();
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [guide, setGuide] = useState(false);
  const { busy, run } = useAccountAction();
  const can = id.trim() !== "" && secret.trim() !== "";
  const save = () => {
    if (!can) return;
    void run(
      () => onSave(sanitizeToken(id), sanitizeToken(secret)),
      () => {
        setId("");
        setSecret("");
        toast.success(t("chat.youtube.creds.saved.toast"));
      },
    );
  };
  const [step1Before, step1After] = splitAt(
    t("chat.youtube.guide.step1"),
    "Google Cloud Console",
  );
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph id="youtube" size={20} />
        <span className="font-display text-sm font-bold">YouTube</span>
        <button
          onClick={() => setGuide((v) => !v)}
          className="ml-auto text-xs font-bold text-brass hover:underline"
        >
          {guide
            ? t("chat.youtube.creds.guide.hide")
            : t("chat.youtube.creds.guide.show")}
        </button>
      </div>

      <ByokModeActions
        modes={modes}
        onUseOfficial={onUseOfficial}
        onUseSaved={onUseSaved}
        onForget={onForget}
      />

      {guide && (
        <>
          <ol className="mb-2.5 list-decimal space-y-2 rounded-md bg-surface px-5 py-3 text-[11px] leading-relaxed text-ink-muted marker:font-bold marker:text-brass">
            <li>
              {step1Before}
              <button
                onClick={() =>
                  void openExternal(
                    "https://console.cloud.google.com/projectcreate",
                  )
                }
                className="font-bold text-brass hover:underline"
              >
                Google Cloud Console
              </button>
              {step1After}
            </li>
            <li>{bold(t, "chat.youtube.guide.step2")}</li>
            <li>{bold(t, "chat.youtube.guide.step3")}</li>
            <li>{bold(t, "chat.youtube.guide.step4")}</li>
            <li>{bold(t, "chat.youtube.guide.step5")}</li>
            <li>{bold(t, "chat.youtube.guide.step6")}</li>
            <li>{bold(t, "chat.youtube.guide.step7")}</li>
          </ol>
          <p className="mb-2.5 rounded-md border-2 border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
            <strong className="text-ink">
              {t("chat.youtube.guide.warn.label")}
            </strong>{" "}
            {bold(t, "chat.youtube.guide.warn.text")}
          </p>
        </>
      )}

      <div className="flex flex-col gap-2">
        <Input
          name="youtube-client-id"
          disabled={busy}
          autoComplete="off"
          placeholder="Client ID"
          aria-label="YouTube — Client ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            type="password"
            name="youtube-client-secret"
            disabled={busy}
            autoComplete="off"
            placeholder="Client Secret"
            aria-label="YouTube — Client Secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && can && save()}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!can || busy}
            loading={busy}
            onClick={save}
          >
            {t("chat.common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
