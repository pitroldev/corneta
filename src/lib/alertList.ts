import type { Alert } from "./types";

export const ALERT_CAP = 100;

export interface AlertList {
  alerts: Alert[];
  /** Alerts received since the list was last cleared, beyond the list's cap. */
  alertsReceived: number;
}

/** The list keeps the latest alerts; the received count keeps growing so new ones still register. */
export function appendAlert(state: AlertList, alert: Alert): AlertList {
  const alerts =
    state.alerts.length < ALERT_CAP
      ? [...state.alerts, alert]
      : [...state.alerts.slice(-(ALERT_CAP - 1)), alert];
  return { alerts, alertsReceived: state.alertsReceived + 1 };
}
