/** A day, or a day and local time when the same article is revised again that day. */
export const REVISION_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/;

/** Readers, feeds and review schedules use the day; the time only orders revisions. */
export function revisionDay(value: string): string {
  return value.slice(0, 10);
}
