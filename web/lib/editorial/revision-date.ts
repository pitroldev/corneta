/** A day, or a day and local time when the same article is revised again that day. */
export const REVISION_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d)?$/;

/** Readers, feeds and review schedules use the day; the time only orders revisions. */
export function revisionDay(value: string): string {
  return value.slice(0, 10);
}

// Editorial dates are Brasília time, which has had no daylight saving since 2019.
const EDITORIAL_UTC_OFFSET = "-03:00";

/** Structured data and Open Graph need the time and the time zone, not a bare day. */
export function revisionDateTime(value: string): string {
  const [day, time = "00:00"] = value.split("T");
  return `${day}T${time}:00${EDITORIAL_UTC_OFFSET}`;
}
