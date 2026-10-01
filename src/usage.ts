import type { Vault } from "obsidian";
import { usageKey } from "./link";
import { collectMentions, finishScan, sanitizeUsage } from "./mentions";
import type { GhIssue, UsageEntry } from "./types";

export class UsageIndex {
  entries: Record<string, UsageEntry> = {};
  private touched: Record<string, UsageEntry> = {};
  private scanning = false;

  load(raw: unknown): void {
    this.entries = sanitizeUsage(raw);
    this.touched = {};
  }

  record(issue: GhIssue): void {
    const key = usageKey(issue.repo, issue.number);
    const prev = this.entries[key];
    const next: UsageEntry = {
      url: issue.url,
      repo: issue.repo,
      number: issue.number,
      title: issue.title,
      count: (prev?.count ?? 0) + 1,
      lastUsed: Date.now(),
    };
    this.entries[key] = next;
    if (this.scanning) this.touched[key] = next;
  }

  async rescan(vault: Vault): Promise<void> {
    this.scanning = true;
    this.touched = {};
    const previous = { ...this.entries };
    try {
      const scanned = await scanVault(vault);
      this.entries = finishScan(scanned, previous, this.touched);
    } finally {
      this.scanning = false;
      this.touched = {};
    }
  }
}

async function scanVault(vault: Vault): Promise<Record<string, UsageEntry>> {
  const files = vault.getMarkdownFiles();
  let scanned: Record<string, UsageEntry> = {};
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    let text = "";
    try {
      text = await vault.cachedRead(file);
    } catch {
      continue;
    }
    const found = collectMentions(text);
    scanned = mergeCounts(scanned, found);
    if (index % 25 === 24) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
  return scanned;
}

function mergeCounts(
  base: Record<string, UsageEntry>,
  extra: Record<string, UsageEntry>,
): Record<string, UsageEntry> {
  for (const [key, entry] of Object.entries(extra)) {
    const existing = base[key];
    if (!existing) {
      base[key] = entry;
      continue;
    }
    existing.count += entry.count;
    if (!existing.title && entry.title) existing.title = entry.title;
  }
  return base;
}
