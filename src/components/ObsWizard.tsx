import { useRef, useState } from "react";
import { Check, Plug, X } from "lucide-react";
import { useT } from "../lib/i18n";
import { Modal } from "./Modal";
import { ObsSetupPanel, type ObsSetupStatus } from "./ObsSetup";
import { Button } from "./ui";

export function ObsWizard({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<ObsSetupStatus>("idle");
  // Focus the heading rather than the close button, which is first in DOM order.
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Modal
      title={t("encoding.wizard.title")}
      onClose={onClose}
      className="max-w-xl rounded-xl bg-surface pop"
      initialFocusRef={titleRef}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between bg-brass px-5 py-4 text-brass-ink">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-brass-ink text-brass">
            <Plug className="size-5" strokeWidth={2.3} />
          </div>
          <div>
            <h2
              id="obs-wizard-title"
              ref={titleRef}
              tabIndex={-1}
              className="text-xl outline-none"
            >
              {t("encoding.wizard.title")}
            </h2>
            <p className="text-xs font-semibold opacity-80">
              {t("encoding.wizard.subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-brass-ink/70 hover:text-brass-ink"
          aria-label={t("encoding.close")}
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <ObsSetupPanel onStatus={setStatus} />
        <div className="flex items-center justify-end gap-3 pt-1">
          {status === "ok" ? (
            <Button variant="primary" onClick={onClose}>
              {t("encoding.wizard.cta.done")}{" "}
              <Check className="size-4" strokeWidth={2.6} />
            </Button>
          ) : (
            <button
              onClick={onClose}
              className="text-sm font-semibold text-ink-faint hover:text-ink-muted"
            >
              {t("encoding.close")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
