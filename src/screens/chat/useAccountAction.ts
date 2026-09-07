import { useRef, useState } from "react";
import { toast } from "../../lib/toast";
import { errMsg } from "../../lib/utils";

export async function performAccountAction(
  action: () => Promise<void>,
  completed: () => void,
  failed: (error: unknown) => void,
) {
  try {
    await action();
    completed();
  } catch (error) {
    failed(error);
  }
}

/** Keep failures visible and block duplicate clicks/Enter while the vault is working. */
export function useAccountAction() {
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>, completed = () => {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await performAccountAction(action, completed, (error) =>
        toast.error(errMsg(error)),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}
