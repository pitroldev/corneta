import type { EditorialDocument, PublishedEditorialDocument } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type EditorialReviewStatus = "overdue" | "due-soon" | "current";

export interface EditorialReviewItem {
  contentId: string;
  title: string;
  href: string;
  relativePath: string;
  collection: "help" | "guides";
  kind: "guide" | "help" | "comparison" | "troubleshooting";
  updatedAt: string;
  reviewedAt: string;
  dueAt: string;
  reviewIntervalDays: number;
  daysUntilDue: number;
  status: EditorialReviewStatus;
  hasExternalSources: boolean;
}

export interface EditorialReviewQueue {
  asOf: string;
  warningDays: number;
  items: EditorialReviewItem[];
  overdueCount: number;
  dueSoonCount: number;
  currentCount: number;
  activityWindowDays: number;
  substantialActivityCount: number;
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return isoDate(new Date(utcDate(value).getTime() + days * DAY_MS));
}

function isPublished(
  document: EditorialDocument,
): document is PublishedEditorialDocument {
  return document.frontmatter.status === "published";
}

function statusRank(status: EditorialReviewStatus): number {
  if (status === "overdue") return 0;
  if (status === "due-soon") return 1;
  return 2;
}

export function buildEditorialReviewQueue(
  documents: readonly EditorialDocument[],
  options: { asOf: string; warningDays?: number },
): EditorialReviewQueue {
  const warningDays = options.warningDays ?? 28;
  const asOfTime = utcDate(options.asOf).getTime();

  const items = documents
    .filter(isPublished)
    .map((document): EditorialReviewItem => {
      const { frontmatter } = document;
      const dueAt = addDays(
        frontmatter.reviewedAt,
        frontmatter.reviewIntervalDays,
      );
      const daysUntilDue = Math.round(
        (utcDate(dueAt).getTime() - asOfTime) / DAY_MS,
      );
      const status: EditorialReviewStatus =
        daysUntilDue < 0
          ? "overdue"
          : daysUntilDue <= warningDays
            ? "due-soon"
            : "current";

      return {
        contentId: frontmatter.contentId,
        title: frontmatter.title,
        href: document.href,
        relativePath: document.relativePath,
        collection: frontmatter.collection,
        kind: frontmatter.kind,
        updatedAt: frontmatter.updatedAt,
        reviewedAt: frontmatter.reviewedAt,
        dueAt,
        reviewIntervalDays: frontmatter.reviewIntervalDays,
        daysUntilDue,
        status,
        hasExternalSources: frontmatter.sources.some(
          (source) => source.kind !== "internal",
        ),
      };
    })
    .sort((left, right) => {
      const byStatus = statusRank(left.status) - statusRank(right.status);
      if (byStatus !== 0) return byStatus;
      const byDueDate = left.dueAt.localeCompare(right.dueAt);
      if (byDueDate !== 0) return byDueDate;
      return left.title.localeCompare(right.title, "pt-BR");
    });

  const activityWindowDays = 28;
  const substantialActivityCount = items.filter((item) => {
    const daysSinceUpdate = Math.round(
      (asOfTime - utcDate(item.updatedAt).getTime()) / DAY_MS,
    );
    return daysSinceUpdate >= 0 && daysSinceUpdate < activityWindowDays;
  }).length;

  return {
    asOf: options.asOf,
    warningDays,
    items,
    overdueCount: items.filter((item) => item.status === "overdue").length,
    dueSoonCount: items.filter((item) => item.status === "due-soon").length,
    currentCount: items.filter((item) => item.status === "current").length,
    activityWindowDays,
    substantialActivityCount,
  };
}

export function renderEditorialReviewMarkdown(
  queue: EditorialReviewQueue,
): string {
  const attention = queue.items.filter((item) => item.status !== "current");
  const lines = [
    "# Editorial maintenance",
    "",
    `Reference date: **${queue.asOf}**`,
    "",
    `- Overdue: **${queue.overdueCount}**`,
    `- Due within ${queue.warningDays} days: **${queue.dueSoonCount}**`,
    `- Current: **${queue.currentCount}**`,
    `- Published or substantively revised in the past ${queue.activityWindowDays} days: **${queue.substantialActivityCount}** (target: 2)`,
    "",
  ];

  if (attention.length === 0) {
    lines.push("No articles require review in this window.", "");
    return lines.join("\n");
  }

  lines.push(
    "| Status | Due date | Article | Interval | External source |",
    "| --- | --- | --- | ---: | --- |",
  );
  for (const item of attention) {
    const state = item.status === "overdue" ? "Overdue" : "Due soon";
    lines.push(
      `| ${state} | ${item.dueAt} | [${item.title}](${item.href}) | ${item.reviewIntervalDays} days | ${item.hasExternalSources ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
