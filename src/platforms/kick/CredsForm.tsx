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
import { useAccountAction } from "../../screens/chat/useAccountAction";

export function KickCredsForm({
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
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const { busy, run } = useAccountAction();
  const canSave = clientId.trim() !== "" && clientSecret.trim() !== "";
  const save = () => {
    if (!canSave) return;
    void run(
      () => onSave(sanitizeToken(clientId), sanitizeToken(clientSecret)),
      () => {
        setClientId("");
        setClientSecret("");
        toast.success(t("chat.kick.creds.saved.toast"));
      },
    );
  };
  return (
    <div className="rounded-md border-2 border-border-soft bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <PlatformGlyph id="kick" size={20} />
        <span className="font-display text-sm font-bold">Kick</span>
        <button
          className="ml-auto text-xs font-bold text-brass hover:underline"
          onClick={() =>
            void openExternal("https://kick.com/settings/developer")
          }
        >
          {t("chat.kick.creds.openDeveloper")}
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink-muted">
        {bold(t, "chat.kick.creds.redirect")}
      </p>
      <ByokModeActions
        modes={modes}
        onUseOfficial={onUseOfficial}
        onUseSaved={onUseSaved}
        onForget={onForget}
      />
      <div className="flex flex-col gap-2">
        <Input
          name="kick-client-id"
          disabled={busy}
          autoComplete="off"
          placeholder="Client ID"
          aria-label="Kick — Client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Input
            name="kick-client-secret"
            disabled={busy}
            autoComplete="off"
            type="password"
            placeholder="Client Secret"
            aria-label="Kick — Client Secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSave && save()}
            className="flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave || busy}
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
