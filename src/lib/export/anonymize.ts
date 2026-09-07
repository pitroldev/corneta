import type { SessionData } from "../types";

/** Remove identifying source data before analysis embeds it in derived text. Use one generic placeholder, not linkable pseudonyms. Preserve streamer channel names but remove local process rankings. */
export function anonymize(d: SessionData, placeholder: string): SessionData {
  return {
    ...d,
    samples: d.samples.map((sample) => ({ ...sample, apps: undefined })),
    alertEvents: d.alertEvents.map((e) => ({ ...e, user: placeholder })),
  };
}
