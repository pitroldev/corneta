import { describe, expect, it } from "vitest";
import { ALERT_CAP, appendAlert, type AlertList } from "./alertList";
import type { Alert } from "./types";

const alert = (id: number): Alert => ({
  id: String(id),
  platform: "twitch",
  source: "twitch:channel",
  kind: "follow",
  user: `viewer${id}`,
  ts: id,
});

describe("alert list", () => {
  it("keeps counting alerts after the list reaches its cap", () => {
    let state: AlertList = { alerts: [], alertsReceived: 0 };
    for (let id = 1; id <= ALERT_CAP + 5; id += 1) {
      const next = appendAlert(state, alert(id));
      expect(next.alertsReceived).toBeGreaterThan(state.alertsReceived);
      state = next;
    }
    expect(state.alerts).toHaveLength(ALERT_CAP);
    expect(state.alertsReceived).toBe(ALERT_CAP + 5);
    expect(state.alerts[0].id).toBe("6");
    expect(state.alerts[state.alerts.length - 1].id).toBe(
      String(ALERT_CAP + 5),
    );
  });
});
