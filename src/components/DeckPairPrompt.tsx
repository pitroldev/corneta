import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { toast } from "../lib/toast";
import type { DeckPairRequest } from "../lib/types";
import { errMsg } from "../lib/utils";
import { Modal } from "./Modal";
import { Button } from "./ui";

/** A phone that scanned the QR waits here until the streamer allows or declines it on the PC. */
export function DeckPairPrompt() {
  const { t } = useI18n();
  const [request, setRequest] = useState<DeckPairRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      api.subscribeDeck({
        pairRequest: (next) => {
          setBusy(false);
          setRequest(next);
        },
        pairClosed: (id) =>
          setRequest((current) => (current?.requestId === id ? null : current)),
      }),
    [],
  );

  if (!request) return null;

  const answer = (allow: boolean) => {
    if (busy) return;
    setBusy(true);
    const { requestId, name } = request;
    api.deckPairAnswer(requestId, allow).then(
      () => {
        setRequest(null);
        if (allow) toast.success(t("deck.prompt.allowed", { name }));
      },
      (e: unknown) => {
        setRequest(null);
        toast.error(errMsg(e));
      },
    );
  };

  return (
    <Modal
      title={t("deck.prompt.title", { name: request.name })}
      onClose={() => answer(false)}
      className="max-w-md"
      lockOutside
    >
      <div className="rounded-lg border-2 border-border bg-surface p-6 pop">
        <span className="mb-4 grid size-12 place-items-center rounded-lg bg-brass text-brass-ink pop-brass -rotate-3">
          <Smartphone className="size-6" />
        </span>
        <h3 className="text-2xl leading-tight">
          {t("deck.prompt.title", { name: request.name })}
        </h3>
        <p className="mt-3 text-sm text-ink-muted">{t("deck.prompt.code")}</p>
        <div
          className="mt-2 flex gap-2"
          aria-label={request.code.split("").join(" ")}
        >
          {request.code.split("").map((digit, i) => (
            <span
              key={i}
              className="grid h-14 w-12 place-items-center rounded-md bg-brass font-display text-3xl font-extrabold text-brass-ink pop-brass"
            >
              {digit}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink-muted">{t("deck.prompt.body")}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => answer(true)}
            loading={busy}
            data-on-brass
          >
            {t("deck.prompt.allow")}
          </Button>
          <Button variant="ghost" onClick={() => answer(false)} disabled={busy}>
            {t("deck.prompt.refuse")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
