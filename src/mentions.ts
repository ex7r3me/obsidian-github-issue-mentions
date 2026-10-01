import { issueUrl, parseIssueUrl } from "./link";
import type { UsageEntry } from "./types";

const ISSUE_IN_TEXT = /https:\/\/github\.com\/([^/\s)#]+)\/([^/\s)#]+)\/issues\/(\d+)/g;

export function collectMentions(text: string): Record<string, UsageEntry> {
  const counts = new Map<string, UsageEntry>();
  const expression = new RegExp(ISSUE_IN_TEXT.source, "g");
  let match: RegExpExecArray | null;
  while ((match = expression.exec(text))) {
    const owner = match[1];
    const name = match[2];
    const number = Number(match[3]);
    if (!owner || !name || !Number.isFinite(number)) continue;
    const repo = `${owner}/${name}`;
    const key = `${repo}#${number}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const title = titleBefore(text, match.index);
    counts.set(key, {
      url: issueUrl(owner, name, number),
      repo,
      number,
      title,
      count: 1,
      lastUsed: 0,
    });
  }
  return Object.fromEntries(counts);
}

export function mergeUsage(
  scanned: Record<string, UsageEntry>,
  previous: Record<string, UsageEntry>,
): Record<string, UsageEntry> {
  const merged: Record<string, UsageEntry> = {};
  for (const [key, entry] of Object.entries(scanned)) {
    const prev = previous[key];
    merged[key] = {
      ...entry,
      title: entry.title || prev?.title,
      lastUsed: prev?.lastUsed ?? 0,
    };
  }
  return merged;
}

export function finishScan(
  scanned: Record<string, UsageEntry>,
  previous: Record<string, UsageEntry>,
  touched: Record<string, UsageEntry>,
): Record<string, UsageEntry> {
  const merged = mergeUsage(scanned, previous);
  for (const [key, live] of Object.entries(touched)) {
    const base = merged[key];
    if (!base) {
      merged[key] = live;
      continue;
    }
    merged[key] = {
      ...base,
      title: live.title || base.title,
      lastUsed: Math.max(live.lastUsed, base.lastUsed),
      count: Math.max(live.count, base.count),
    };
  }
  return merged;
}

export function sanitizeUsage(raw: unknown): Record<string, UsageEntry> {
  if (!raw || typeof raw !== "object") return {};
  const result: Record<string, UsageEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Partial<UsageEntry>;
    const parsed = parseIssueUrl(typeof entry.url === "string" ? entry.url : "");
    if (!parsed || typeof entry.repo !== "string" || typeof entry.number !== "number") continue;
    if (entry.repo !== parsed.repo || entry.number !== parsed.number) continue;
    result[key] = {
      url: parsed.url,
      repo: parsed.repo,
      number: parsed.number,
      title: typeof entry.title === "string" ? entry.title : undefined,
      count: typeof entry.count === "number" && entry.count > 0 ? entry.count : 1,
      lastUsed: typeof entry.lastUsed === "number" ? entry.lastUsed : 0,
    };
  }
  return result;
}

export function topUsed(usage: Record<string, UsageEntry>, limit: number): UsageEntry[] {
  return Object.values(usage)
    .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed || a.number - b.number)
    .slice(0, limit);
}

function titleBefore(text: string, urlStart: number): string | undefined {
  const prefix = text.slice(Math.max(0, urlStart - 240), urlStart);
  const match = /\[([^\]\n]{0,160})\]\($/.exec(prefix);
  if (!match?.[1]) return undefined;
  const label = match[1].replace(/\s+/g, " ").trim().replace(/^#\d+\s*/, "").trim();
  return label || undefined;
}
