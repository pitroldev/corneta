const platforms = [
  { name: "Twitch", color: "#a970ff", viewers: "1.284", status: "no ar" },
  { name: "YouTube", color: "#ff4733", viewers: "862", status: "no ar" },
  { name: "Kick", color: "#53fc18", viewers: "317", status: "no ar" },
];

function WaveChart() {
  return (
    <svg
      className="h-16 w-full overflow-visible"
      viewBox="0 0 360 64"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 48 C28 44 32 25 58 32 S94 49 122 29 158 18 184 31 218 55 246 24 286 6 320 21 344 17 360 11"
        fill="none"
        stroke="var(--brass)"
        strokeWidth="4"
        strokeLinecap="square"
      />
      <path
        d="M0 48 C28 44 32 25 58 32 S94 49 122 29 158 18 184 31 218 55 246 24 286 6 320 21 344 17 360 11 V64 H0Z"
        fill="url(#chart-fill)"
      />
      <defs>
        <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="var(--brass)" stopOpacity=".28" />
          <stop offset="1" stopColor="var(--brass)" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ProductPreview() {
  return (
    <div
      className="preview-shell"
      aria-label="Prévia da central ao vivo da Corneta"
    >
      <div className="preview-titlebar">
        <span className="flex items-center gap-2">
          <span className="size-2.5 bg-tomato" />
          <span className="size-2.5 bg-brass" />
          <span className="size-2.5 bg-ok" />
        </span>
        <span className="preview-title">CENTRAL AO VIVO</span>
        <span className="text-[10px] font-bold text-cream/45">00:42:18</span>
      </div>

      <div className="grid grid-cols-[68px_1fr] sm:grid-cols-[86px_1fr]">
        <aside className="preview-sidebar">
          <span className="preview-logo">C</span>
          {["PL", "QL", "LIVE", "CHAT"].map((item, index) => (
            <span
              key={item}
              className={`preview-nav-item ${index === 2 ? "is-active" : ""}`}
            >
              {item}
            </span>
          ))}
        </aside>

        <div className="min-w-0 bg-[#17100b] p-3 sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-[8px] font-bold uppercase tracking-[.2em] text-brass sm:text-[9px]">
                Tudo certo por aqui
              </p>
              <h3 className="font-display text-xl leading-none text-cream sm:text-3xl">
                SUA LIVE ESTÁ ECOANDO.
              </h3>
            </div>
            <span className="live-pill">
              <span className="size-1.5 animate-pulse bg-current" /> AO VIVO
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.35fr_.65fr]">
            <div className="preview-card">
              <div className="mb-4 flex items-center justify-between">
                <span className="preview-label">Destinos</span>
                <span className="text-[9px] font-bold text-ok">3/3 firmes</span>
              </div>
              <div className="space-y-2.5">
                {platforms.map((platform) => (
                  <div key={platform.name} className="platform-row">
                    <span
                      className="size-2.5 shrink-0"
                      style={{ backgroundColor: platform.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-cream sm:text-xs">
                      {platform.name}
                    </span>
                    <span className="hidden text-[9px] text-cream/45 xs:inline">
                      {platform.viewers}
                    </span>
                    <span className="text-[8px] font-extrabold uppercase text-ok">
                      {platform.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="preview-card hidden sm:block">
              <span className="preview-label">Público agora</span>
              <strong className="mt-3 block font-display text-4xl text-cream">
                2.463
              </strong>
              <span className="text-[9px] font-bold text-ok">↑ crescendo</span>
            </div>
          </div>

          <div className="preview-card mt-3 hidden sm:block">
            <div className="mb-1 flex items-center justify-between">
              <span className="preview-label">Sinal nos últimos minutos</span>
              <span className="text-[9px] text-cream/45">6.000 kbps</span>
            </div>
            <WaveChart />
          </div>
        </div>
      </div>
    </div>
  );
}
