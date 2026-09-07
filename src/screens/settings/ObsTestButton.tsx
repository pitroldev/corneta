import { AlertTriangle, Check, Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { useStore } from "../../lib/store";
import { useT } from "../../lib/i18n";
import { addStep } from "../../lib/telemetry";
import { ObsConfigSaveError } from "../../lib/obsCoordinator";
import type { ObsCheck } from "../../lib/types";
import { cn } from "../../lib/utils";

/** Testa o obs-websocket ali mesmo. Quatro desfechos, não dois: não achei /
 *  senha recusada / conectado mas apontando pra outro lugar / conectado de verdade. */
export function ObsTestButton() {
  const t = useT();
  const checkObs = useStore((s) => s.checkObs);
  const [obs, setObs] = useState<ObsCheck | "loading" | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const run = async () => {
    if (running.current) return;
    running.current = true;
    setObs("loading");
    setSaveFailed(false);
    addStep("obs_check_started", { stage: "obs_check" });
    try {
      const result = await checkObs(true);
      if (!active.current) return;
      setObs(result);
    } catch (e) {
      if (!active.current) return;
      setSaveFailed(e instanceof ObsConfigSaveError);
      setObs({
        reachable: false,
        pointingAtCorneta: false,
        width: 0,
        height: 0,
        fps: 0,
        error: String(e),
      });
    } finally {
      running.current = false;
    }
  };

  const verdict = (() => {
    if (!obs || obs === "loading") return null;
    if (saveFailed)
      return { tone: "text-bad", msg: t("settings.obs.test.saveFailed") };
    if (!obs.reachable) {
      const authFail = obs.authFailed;
      return authFail
        ? {
            tone: "text-bad",
            msg: t("settings.obs.test.authFail"),
          }
        : {
            tone: "text-bad",
            msg: t("settings.obs.test.notFound"),
          };
    }
    if (!obs.pointingAtCorneta)
      return {
        tone: "text-warn",
        msg: t("settings.obs.test.wrongTarget"),
      };
    return {
      tone: "text-ok",
      msg:
        obs.width > 0
          ? t("settings.obs.test.okDetail", {
              width: obs.width,
              height: obs.height,
              fps: obs.fps,
            })
          : t("settings.obs.test.ok"),
    };
  })();

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant="subtle"
        size="sm"
        onClick={run}
        loading={obs === "loading"}
        disabled={obs === "loading"}
      >
        {obs !== "loading" && <Plug className="size-4" />}
        {t("settings.obs.test.button")}
      </Button>
      {verdict && (
        <span
          role="status"
          className={cn(
            "flex max-w-64 items-start gap-1 text-right text-xs font-semibold",
            verdict.tone,
          )}
        >
          {verdict.tone === "text-ok" ? (
            <Check className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          )}
          {verdict.msg}
        </span>
      )}
    </div>
  );
}
