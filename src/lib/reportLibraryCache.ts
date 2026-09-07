import type { SessionMeta, SessionSummary } from "./types";

type SessionRevision = Pick<SessionMeta, "id" | "sourceRevision">;
interface Entry {
  revision?: string;
  summary: SessionSummary | null;
}

/** Route-scoped results survive list/detail navigation, including unfinished reports. */
export class ReportLibraryCache {
  private entries = new Map<string, Entry>();
  private revisions = new Map<string, string | undefined>();

  snapshot(
    sessions: readonly SessionRevision[],
  ): Record<string, SessionSummary | null> {
    const summaries: Record<string, SessionSummary | null> = {};
    for (const session of sessions) {
      const entry = this.entries.get(session.id);
      if (entry && entry.revision === session.sourceRevision) {
        summaries[session.id] = entry.summary;
      }
    }
    return summaries;
  }

  prepare(
    sessions: readonly SessionRevision[],
    persisted: (id: string) => SessionSummary | null,
  ) {
    this.revisions = new Map(
      sessions.map((session) => [session.id, session.sourceRevision]),
    );
    for (const [id, entry] of this.entries) {
      if (
        !this.revisions.has(id) ||
        this.revisions.get(id) !== entry.revision
      ) {
        this.entries.delete(id);
      }
    }
    const missing: string[] = [];
    for (const session of sessions) {
      if (this.entries.has(session.id)) continue;
      const summary = persisted(session.id);
      if (summary) this.remember(session.id, session.sourceRevision, summary);
      else missing.push(session.id);
    }
    return { summaries: this.snapshot(sessions), missing };
  }

  remember(
    id: string,
    revision: string | undefined,
    summary: SessionSummary | null,
  ) {
    if (this.revisions.has(id) && this.revisions.get(id) === revision) {
      this.entries.set(id, { revision, summary });
    }
  }
}
