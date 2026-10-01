import type { Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo } from "obsidian";
import { EditorSuggest, type TFile } from "obsidian";
import { GitHubError, isAbortError } from "./github";
import { formatIssueLink, parseGhTrigger } from "./link";
import type GitHubIssueMentionsPlugin from "./main";
import type { Suggestion } from "./types";

const DEBOUNCE_MS = 250;

export class IssueSuggest extends EditorSuggest<Suggestion> {
  private timer: number | null = null;
  private abort: AbortController | null = null;
  private pendingResolve: ((items: Suggestion[]) => void) | null = null;
  private latest: Suggestion[] = [];

  constructor(private readonly plugin: GitHubIssueMentionsPlugin) {
    super(plugin.app);
    this.limit = 15;
    this.setInstructions([
      { command: "↑↓", purpose: "to navigate" },
      { command: "↵", purpose: "to insert" },
      { command: "esc", purpose: "to dismiss" },
    ]);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line);
    const before = line.slice(0, cursor.ch);
    const trigger = parseGhTrigger(before);
    if (!trigger) return null;
    return {
      start: { line: cursor.line, ch: trigger.start },
      end: cursor,
      query: trigger.query,
    };
  }

  getSuggestions(context: EditorSuggestContext): Promise<Suggestion[]> {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.pendingResolve?.(this.latest);
    this.pendingResolve = null;
    this.abort?.abort();

    const abort = new AbortController();
    this.abort = abort;
    const query = context.query;

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.timer = window.setTimeout(() => {
        this.timer = null;
        this.pendingResolve = null;
        void this.run(query, abort)
          .then((results) => {
            if (abort.signal.aborted) {
              resolve(this.latest);
              return;
            }
            this.latest = results;
            for (const item of results) {
              if (item.kind === "issue") this.plugin.rememberIssue(item.issue);
            }
            resolve(results);
          })
          .catch((error: unknown) => {
            if (abort.signal.aborted || isAbortError(error)) {
              resolve(this.latest);
              return;
            }
            const text = error instanceof GitHubError ? error.message : "Could not search GitHub issues.";
            const results: Suggestion[] = [{ kind: "message", text }];
            this.latest = results;
            resolve(results);
          });
      }, DEBOUNCE_MS);
    });
  }

  renderSuggestion(item: Suggestion, el: HTMLElement): void {
    if (item.kind === "message") {
      el.createDiv({ cls: "gh-issue-message", text: item.text });
      return;
    }

    const row = el.createDiv({ cls: "gh-issue-row" });
    row.createSpan({ cls: "gh-issue-number", text: `#${item.issue.number}` });
    row.createSpan({ cls: "gh-issue-title", text: item.issue.title });

    const meta = el.createDiv({ cls: "gh-issue-meta" });
    meta.createSpan({ cls: "gh-issue-repo", text: item.issue.repo });
    meta.createSpan({
      cls: `gh-issue-state ${item.issue.state === "OPEN" ? "is-open" : "is-closed"}`,
      text: item.issue.state === "OPEN" ? "Open" : "Closed",
    });
    if (item.usageCount > 0) {
      meta.createSpan({ cls: "gh-issue-used", text: `used ${item.usageCount}×` });
    }
  }

  selectSuggestion(item: Suggestion, _evt: MouseEvent | KeyboardEvent): void {
    if (item.kind !== "issue") return;
    const context = this.context;
    if (!context) return;
    const text = formatIssueLink(item.issue);
    context.editor.replaceRange(text, context.start, context.end);
    context.editor.setCursor({
      line: context.start.line,
      ch: context.start.ch + text.length,
    });
    this.plugin.rememberIssue(item.issue);
    this.plugin.recordUse(item.issue);
    this.close();
  }

  destroy(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.abort?.abort();
    this.pendingResolve?.(this.latest);
    this.pendingResolve = null;
  }

  private run(query: string, abort: AbortController): Promise<Suggestion[]> {
    return this.plugin.search(query, abort.signal);
  }
}
