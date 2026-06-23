import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "./lib/store";
import { Sidebar, type Screen } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { Toaster } from "./components/Toaster";
import { Onboarding } from "./components/Onboarding";
import { Mascot, SoundWaves } from "./components/decor";
import { PlatformsScreen } from "./screens/PlatformsScreen";
import { EncodingScreen } from "./screens/EncodingScreen";
import { GoLiveScreen } from "./screens/GoLiveScreen";
import { AboutScreen } from "./screens/AboutScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const load = useStore((s) => s.load);
  const bindEngine = useStore((s) => s.bindEngine);
  const [screen, setScreen] = useState<Screen>("platforms");

  useEffect(() => {
    void load();
    const unbind = bindEngine();
    return unbind;
  }, [load, bindEngine]);

  return (
    <div className="flex h-full flex-col overflow-hidden border border-border-soft">
      <TitleBar />

      {!loaded ? (
        <div className="grid flex-1 place-items-center">
          <div className="grid size-16 animate-shout place-items-center rounded-lg bg-brass text-brass-ink pop-brass">
            <Mascot className="size-9" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Sidebar screen={screen} onNavigate={setScreen} />

          <main className="relative flex-1 overflow-hidden">
            <SoundWaves className="pointer-events-none absolute -bottom-20 -right-16 size-80 text-brass/[0.05]" />

            <div className="h-full overflow-y-auto px-8 py-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={screen}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  {screen === "platforms" && <PlatformsScreen />}
                  {screen === "encoding" && <EncodingScreen />}
                  {screen === "golive" && <GoLiveScreen />}
                  {screen === "about" && <AboutScreen />}
                  {screen === "settings" && <SettingsScreen />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      )}

      <Toaster />
      <Onboarding onStart={() => setScreen("platforms")} />
    </div>
  );
}
