import { PlatformGlyph } from "./decor";
import { EyeIcon } from "./icons";

// Sala de guerra: o que o painel Ao vivo mostra por destino enquanto você
// transmite — bitrate, fps, quadros perdidos e tempo no ar, mais CPU/GPU reais.
// Estados e nomes de métrica saem de TargetStatus/EngineSnapshot (src/lib/types.ts).

export function LiveRoom() {
  return (
    <div className="warroom">
      <div className="demo-label">
        <span>painel ao vivo · 01:42:08</span>
        <span>números ilustrativos</span>
      </div>

      <div className="warroom-row">
        <PlatformGlyph id="twitch" />
        <div>
          <strong>Twitch</strong>
          <small>5 998 kbps · 60 fps · 0 quedas · 1h42</small>
        </div>
        <span className="state">
          <i /> no ar
        </span>
      </div>

      <div className="warroom-row">
        <PlatformGlyph id="youtube" />
        <div>
          <strong>YouTube</strong>
          <small>6 002 kbps · 60 fps · 0 quedas · 1h42</small>
        </div>
        <span className="state">
          <i /> no ar
        </span>
      </div>

      <div className="warroom-row">
        <PlatformGlyph id="kick" />
        <div>
          <strong>Kick</strong>
          <small>reconectando · tentativa 2 · 12 s fora</small>
        </div>
        <span className="state state-warn">
          <i /> voltando
        </span>
      </div>

      <div className="warroom-row">
        <PlatformGlyph id="tiktok" />
        <div>
          <strong>TikTok</strong>
          <small>pausado por você · 720×1280</small>
        </div>
        <span className="state state-quiet">
          <i /> em pausa
        </span>
      </div>

      <div className="warroom-foot">
        <span className="meter">
          CPU
          <i>
            <b style={{ width: "18%" }} />
          </i>
          18%
        </span>
        <span className="meter meter-ok">
          Placa
          <i>
            <b style={{ width: "31%" }} />
          </i>
          31%
        </span>
        <span className="meter">
          <EyeIcon />1 284 assistindo
        </span>
      </div>
    </div>
  );
}

// Relatório pós-live: a curva de audiência com os marcadores do que aconteceu.
// A análise real (src/screens/ReportsScreen.tsx) usa viewerSamples, alertEvents,
// taxa de chat e janelas com problema; aqui é uma sessão de exemplo.
const CURVE =
  "M0,74 L18,70 L36,66 L54,58 L72,55 L90,49 L108,52 L126,44 L144,40 L162,34 L180,22 L198,18 L216,20 L234,26 L252,24 L270,30 L288,36 L306,33 L324,42 L342,48 L360,60";

export function ReportChart() {
  return (
    <div className="chart-panel">
      <div className="demo-label">
        <span>relatório da live · 3h12</span>
        <span>sessão de exemplo</span>
      </div>

      <svg
        className="chart"
        viewBox="0 0 360 96"
        preserveAspectRatio="none"
        role="img"
        aria-label="Curva de audiência de uma live de exemplo, com um pico no raid e um trecho com queda de sinal."
      >
        <line className="chart-grid" x1="0" y1="24" x2="360" y2="24" />
        <line className="chart-grid" x1="0" y1="56" x2="360" y2="56" />
        <path className="chart-area" d={`${CURVE} L360,96 L0,96 Z`} />
        <path className="chart-line" d={CURVE} />
        {/* As bolinhas usam a cor da legenda correspondente: latão = raid,
            âmbar = trecho com queda. */}
        <circle className="chart-mark-raid" cx="180" cy="22" r="4.5" />
        <circle className="chart-mark-warn" cx="252" cy="24" r="4.5" />
      </svg>

      <div className="chart-scale">
        <span>21:00</span>
        <span>22:30</span>
        <span>00:12</span>
      </div>

      <div className="chart-chips">
        <span className="chip chip-ok">pico 1 284</span>
        <span className="chip chip-quiet">média 870</span>
        <span className="chip chip-quiet">3 412 mensagens</span>
        <span className="chip">raid às 22:30</span>
        <span className="chip chip-warn">1 trecho com queda</span>
      </div>
    </div>
  );
}
