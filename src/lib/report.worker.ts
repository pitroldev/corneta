import { createReportTaskRunner, type ReportTask } from "./reportTasks";
const runReportTask = createReportTaskRunner();

// Keep request order, including async dictionary/export imports. No resident
// session cache: results become owned by the UI and inputs can be collected.
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
