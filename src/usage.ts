import { usageKey } from "./link";
import { sanitizeUsage } from "./mentions";
import type { GhIssue, UsageEntry } from "./types";

export class UsageIndex {
  entries: Record<string, UsageEntry> = {};

  load(raw: unknown): void {
    this.entries = sanitizeUsage(raw);
  }

  record(issue: GhIssue): void {
    const key = usageKey(issue.repo, issue.number);
    const prev = this.entries[key];
    this.entries[key] = {
      url: issue.url,
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      count: (prev?.count ?? 0) + 1,
      lastUsed: Date.now(),
    };
  }
}
