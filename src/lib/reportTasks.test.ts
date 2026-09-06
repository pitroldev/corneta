import { describe, expect, it, vi } from "vitest";
import { createReportTaskRunner } from "./reportTasks";
import { analyze, parseSession, withReportMarkers } from "./report";
import { loadI18n } from "./i18n/core";
import { selectedReportExport } from "./export/selected";

const exporters = vi.hoisted(() => ({
  html: vi.fn((_data: unknown, _analysis: unknown) => "html"),
  csv: vi.fn((_data: unknown, _analysis: unknown) => "csv"),
  json: vi.fn((_data: unknown, _analysis: unknown) => "json"),
}));
vi.mock("./export/html", () => ({ reportHtml: exporters.html }));
vi.mock("./export/csv", () => ({ seriesCsv: exporters.csv }));
vi.mock("./export/json", () => ({ reportJson: exporters.json }));
const raw = [
  {
    kind: "meta",
    id: "1786151052661",
    startedAt: 1000,
    mode: "per-platform",
    platforms: [],
  },
  { kind: "sample", t: 1000, cpu: 10, targets: [] },
  { kind: "sample", t: 3000, cpu: 30, targets: [] },
  { kind: "end", endedAt: 5000 },
]
  .map((line) => JSON.stringify(line))
  .join("\n");

describe("report tasks", () => {
  it("uses the same analysis for the detail and its summary, including binary input", async () => {
    const run = createReportTaskRunner();
    const detail = await run({
      kind: "analyze",
      raw: new TextEncoder().encode(raw).buffer,
      locale: "pt-BR",
    });
    expect(detail).not.toBeNull();
    if (!detail || !("data" in detail)) throw new Error("Missing detail");
    const summary = await run({ kind: "summary", raw, locale: "pt-BR" });
    expect(summary).toEqual({ summary: detail.summary, complete: true });
  });

  it("does not persist summaries for sessions without a real end record", async () => {
    const result = await createReportTaskRunner()({
      kind: "summary",
      raw: raw.split("\n").slice(0, -1).join("\n"),
      locale: "pt-BR",
    });
    expect(result).toMatchObject({ complete: false });
  });

  it("updates markers without recomputing resource diagnosis", async () => {
    const { t } = await loadI18n("pt-BR");
    const data = parseSession(raw, t)!;
    const analysis = analyze(data, t);
    const markers = [{ t: 2000, label: "Momento" }];
    const updated = withReportMarkers(analysis, markers, t);
    expect(updated.events).toEqual(analyze({ ...data, markers }, t).events);
    expect(updated.windows).toBe(analysis.windows);
    expect(updated.byChannel).toBe(analysis.byChannel);
  });

  it.each(["html", "csv", "json"] as const)(
    "executes only the requested %s exporter",
    async (format) => {
      Object.values(exporters).forEach((mock) => mock.mockClear());
      const i18n = await loadI18n("en");
      const data = parseSession(raw, i18n.t)!;
      const analysis = analyze(data, i18n.t);
      await selectedReportExport(data, analysis, i18n, format, false);
      for (const [key, mock] of Object.entries(exporters))
        expect(mock).toHaveBeenCalledTimes(key === format ? 1 : 0);
      expect(exporters[format].mock.calls[0]?.[1]).toBe(analysis);
    },
  );

  it("keeps chat pages bounded and applies deletions from outside the visible interval", async () => {
    const run = createReportTaskRunner();
    const lines = Array.from({ length: 10000 }, (_, t) =>
      JSON.stringify({ t, m: `message-${t}`, i: String(t), p: "twitch" }),
    );
    lines.push(JSON.stringify({ t: 20000, del: "5000" }));
    const page = await run({
      kind: "chat",
      raw: lines.join("\n"),
      epoch: 5100,
    });
    if (!page || !("messages" in page)) throw new Error("Missing chat page");
    expect(page.messages.length).toBeLessThanOrEqual(700);
    expect(page.messages.find((message) => message.i === "5000")?.deleted).toBe(
      true,
    );
    const previous = await run({ kind: "chatPage", epoch: 0 });
    expect(previous).toMatchObject({ start: 0, total: 10000 });
  });
});
