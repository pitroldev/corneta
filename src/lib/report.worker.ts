import { createReportTaskRunner, type ReportTask } from "./reportTasks";
const runReportTask = createReportTaskRunner();

// Preserve request order across async imports; release inputs after transferring ownership to the UI.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<{ id: number; task: ReportTask }>) => {
  queue = queue.then(async () => {
    const { id, task } = event.data;
    try {
      self.postMessage({ id, result: await runReportTask(task) });
    } catch (error) {
      self.postMessage({
        id,
        error:
          error instanceof Error ? error.message : "report_processing_failed",
      });
    }
  });
};
