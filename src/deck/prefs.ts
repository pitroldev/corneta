import { useEffect, useState } from "react";
import { UI_SCALE, loadPrefs, savePrefs, type DeckPrefs } from "./model";
import { applyTheme, applyUiScale, setHaptics } from "./ui";

/** This phone's choices, saved on the phone and applied to haptics and the interface scale. */
export function useDeckPrefs(): [DeckPrefs, (next: DeckPrefs) => void] {
  const [prefs, setPrefs] = useState(() => loadPrefs(window.localStorage));
  useEffect(() => {
    savePrefs(window.localStorage, prefs);
    setHaptics(prefs.vibrate);
    applyUiScale(UI_SCALE[prefs.ui]);
    applyTheme(prefs.theme);
  }, [prefs]);
  return [prefs, setPrefs];
}

/** Applies the saved scale and theme before the deck mounts, so pairing screens use them too. */
export function applySavedPrefs() {
  const prefs = loadPrefs(window.localStorage);
  setHaptics(prefs.vibrate);
  applyUiScale(UI_SCALE[prefs.ui]);
  applyTheme(prefs.theme);
}
