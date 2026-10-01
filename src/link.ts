import type { GhIssue, IssueRef } from "./types";

const ISSUE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/;
const LINE_ISSUE =
  /\[([^\]\n]*)\]\((https:\/\/github\.com\/([^/\s)#]+)\/([^/\s)#]+)\/issues\/(\d+)[^)\n]*)\)|https:\/\/github\.com\/([^/\s)#]+)\/([^/\s)#]+)\/issues\/(\d+)/g;

export function usageKey(repo: string, number: number): string {
  return `${repo}#${number}`;
}

export function issueUrl(owner: string, name: string, number: number): string {
  return `https://github.com/${owner}/${name}/issues/${number}`;
}

export function parseIssueUrl(raw: string | null | undefined): IssueRef | null {
  if (!raw) return null;
  let value = raw.trim();
  try {
    value = decodeURI(value);
  } catch {
    // Keep the raw value when it is not valid percent-encoding.
  }
  const withoutHash = value.split("#")[0] ?? value;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  const match = ISSUE_URL.exec(withoutQuery);
  if (!match) return null;
  const owner = match[1];
  const name = match[2];
  const number = Number(match[3]);
  if (!owner || !name || !Number.isFinite(number)) return null;
  return {
    owner,
    name,
    repo: `${owner}/${name}`,
    number,
    url: issueUrl(owner, name, number),
  };
}

export function parseGhTrigger(textBeforeCursor: string): { query: string; start: number } | null {
  const match = /(?:^|\s)(gh#[^\n]*)$/.exec(textBeforeCursor);
  if (!match?.[1] || match.index === undefined) return null;
  const full = match[1];
  return {
    query: full.slice("gh#".length),
    start: textBeforeCursor.length - full.length,
  };
}

export function formatIssueLink(issue: Pick<GhIssue, "number" | "title" | "url">): string {
  const title = issue.title.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim();
  const short = title.length > 80 ? `${title.slice(0, 79).trimEnd()}…` : title;
  const label = short ? `#${issue.number} ${short}` : `#${issue.number}`;
  return `[${label}](${issue.url}) `;
}

export function issueRefAtOffset(line: string, offset: number): IssueRef | null {
  const expression = new RegExp(LINE_ISSUE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = expression.exec(line))) {
    const start = match.index;
    const end = start + match[0].length;
    if (offset < start || offset > end) continue;
    if (match[3] && match[4] && match[5]) {
      return refFromParts(match[3], match[4], Number(match[5]));
    }
    if (match[6] && match[7] && match[8]) {
      return refFromParts(match[6], match[7], Number(match[8]));
    }
  }
  return null;
}

export function excerpt(body: string, limit = 400): string {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
}

export function safeHex(color: string): string | null {
  const hex = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex}`;
}

export function contrastColor(hex: string): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

export function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function refFromParts(owner: string, name: string, number: number): IssueRef | null {
  if (!Number.isFinite(number)) return null;
  return {
    owner,
    name,
    repo: `${owner}/${name}`,
    number,
    url: issueUrl(owner, name, number),
  };
}
