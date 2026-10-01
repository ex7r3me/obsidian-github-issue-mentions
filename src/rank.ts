import { usageKey } from "./link";
import type { GhIssue, UsageEntry } from "./types";

export const RESULT_LIMIT = 15;

export interface RankedIssue {
  issue: GhIssue;
  usageCount: number;
  match: number;
}

export function rankIssues(
  issues: GhIssue[],
  query: string,
  usage: Record<string, UsageEntry>,
): RankedIssue[] {
  const ranked = dedupeIssues(issues).map((issue) => {
    const entry = usage[usageKey(issue.repo, issue.number)];
    return {
      issue,
      usageCount: entry?.count ?? 0,
      match: matchScore(issue, query),
    };
  });

  ranked.sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    if (b.match !== a.match) return b.match - a.match;
    if (a.issue.state !== b.issue.state) return a.issue.state === "OPEN" ? -1 : 1;
    return a.issue.number - b.issue.number;
  });

  return ranked.slice(0, RESULT_LIMIT);
}

export function dedupeIssues(issues: GhIssue[]): GhIssue[] {
  const seen = new Map<string, GhIssue>();
  for (const issue of issues) {
    seen.set(usageKey(issue.repo, issue.number), issue);
  }
  return [...seen.values()];
}

function matchScore(issue: GhIssue, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  let score = 0;
  const num = String(issue.number);
  if (num === q) score += 500;
  else if (num.startsWith(q)) score += 200;

  const title = issue.title.toLowerCase();
  if (title.startsWith(q)) score += 80;
  else if (title.includes(q)) score += 40;
  else {
    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts.every((part) => title.includes(part) || num.includes(part))) {
      score += 30;
    }
  }

  if (issue.repo.toLowerCase().includes(q)) score += 20;
  return score;
}
