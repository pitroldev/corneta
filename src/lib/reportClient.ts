import type {
  ReportTask,
  ReportTaskResult,
  ReportResultByKind,
} from "./reportTasks";

/** One bounded, cancellable worker per consumer. It loads only when requested. */
export class ReportClient {
  private worker: Worker | null = null;
  private serial = 0;
  private disposed = false;
  private pending = new Map<
    number,
    {
      resolve: (value: ReportTaskResult) => void;
      reject: (error: Error) => void;
    }
  >();

  run<Task extends ReportTask>(
    task: Task,
  ): Promise<ReportResultByKind[Task["kind"]]>;
  run(task: ReportTask): Promise<ReportTaskResult> {
    if (this.disposed)
      return Promise.reject(new DOMException("Cancelled", "AbortError"));
    if (this.pending.size >= 4)
      return Promise.reject(new Error("report_queue_full"));
    if (!this.worker) {
      this.worker = new Worker(new URL("./report.worker.ts", import.meta.url), {
        type: "module",
      });
      this.worker.onmessage = (
        event: MessageEvent<{
          id: number;
          result: ReportTaskResult;
          error?: string;
        }>,
      ) => {
        const entry = this.pending.get(event.data.id);
        if (!entry) return;
        this.pending.delete(event.data.id);
        if (event.data.error) entry.reject(new Error(event.data.error));
        else entry.resolve(event.data.result);
      };
      this.worker.onerror = () =>
        this.dispose(new Error("report_worker_failed"));
    }
    const id = ++this.serial;
    return new Promise<ReportTaskResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        const transfer =
          "raw" in task && task.raw instanceof ArrayBuffer ? [task.raw] : [];
        this.worker!.postMessage({ id, task }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  dispose(error: Error = new DOMException("Cancelled", "AbortError")): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }
}
