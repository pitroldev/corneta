import { expectTypeOf, it } from "vitest";
import type { ReportClient } from "./reportClient";
import type { ChatPage } from "./replayChatPage";
import type { ReportSummaryResult, ReportDetailResult } from "./reportTasks";

// Compiled by typecheck, never executed: no Worker or browser is required.
function contracts(client: ReportClient) {
  const chat = client.run({ kind: "chatPage", epoch: 0 });
  const summary = client.run({ kind: "summary", raw: "", locale: "en" });
  const detail = client.run({ kind: "analyze", raw: "", locale: "pt-BR" });
  expectTypeOf(chat).toEqualTypeOf<Promise<ChatPage>>();
  expectTypeOf(summary).toEqualTypeOf<Promise<ReportSummaryResult | null>>();
  expectTypeOf(detail).toEqualTypeOf<Promise<ReportDetailResult | null>>();
  // @ts-expect-error A chat page is not a report summary.
  const wrong: Promise<ReportSummaryResult> = chat;
  void wrong;
  // @ts-expect-error Callers specify tasks, never an arbitrary result type.
  client.run<ReportSummaryResult>({ kind: "chatPage", epoch: 0 });
}

it("keeps task/result contracts checked without starting a worker", () => {
  expectTypeOf(contracts).parameter(0).toEqualTypeOf<ReportClient>();
});
