import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { GitHubError } from "./github";
import {
  contrastColor,
  excerpt,
  formatUpdated,
  issueRefAtOffset,
  parseIssueUrl,
  safeHex,
} from "./link";
import type GitHubIssueMentionsPlugin from "./main";
import type { GhIssue, IssueRef } from "./types";

const SHOW_DELAY_MS = 300;
const HIDE_DELAY_MS = 400;

export class IssueHover {
  private popover: HTMLElement | null = null;
  private showTimer: number | null = null;
  private hideTimer: number | null = null;
  private pendingUrl: string | null = null;
  private openUrl: string | null = null;
  private cache = new Map<string, GhIssue>();
  private point: { x: number; y: number } | null = null;

  constructor(private readonly plugin: GitHubIssueMentionsPlugin) {}

  remember(issue: GhIssue): void {
    this.cache.set(issue.url, issue);
    this.cache.set(`${issue.repo}#${issue.number}`, issue);
  }

  bindPreview(el: HTMLElement): void {
    const links = el.querySelectorAll<HTMLAnchorElement>("a[href]");
    for (const link of Array.from(links)) {
      const ref = parseIssueUrl(link.getAttribute("href"));
      if (!ref || link.dataset.ghIssueBound === "1") continue;
      link.dataset.ghIssueBound = "1";
      link.addEventListener("mouseenter", () => this.scheduleShow(link, ref));
      link.addEventListener("mouseleave", () => this.scheduleHide());
    }
  }

  scheduleShow(anchor: HTMLElement, ref: IssueRef, point?: { x: number; y: number }): void {
    if (this.openUrl === ref.url && this.popover) {
      this.cancelHide();
      return;
    }
    if (this.pendingUrl === ref.url && this.showTimer !== null) return;
    this.cancelHide();
    this.clearShow();
    this.pendingUrl = ref.url;
    this.point = point ?? null;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      this.pendingUrl = null;
      void this.open(anchor, ref);
    }, SHOW_DELAY_MS);
  }

  scheduleHide(): void {
    this.clearShow();
    this.pendingUrl = null;
    if (this.hideTimer !== null || !this.popover) return;
    this.hideTimer = window.setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, HIDE_DELAY_MS);
  }

  hide(): void {
    this.clearShow();
    this.cancelHide();
    this.pendingUrl = null;
    this.openUrl = null;
    this.popover?.remove();
    this.popover = null;
  }

  contains(node: Node): boolean {
    return !!this.popover?.contains(node);
  }

  destroy(): void {
    this.hide();
  }

  private async open(anchor: HTMLElement, ref: IssueRef): Promise<void> {
    this.openUrl = ref.url;
    const popover = this.ensurePopover();
    const cached = this.cache.get(ref.url) ?? this.cache.get(`${ref.repo}#${ref.number}`);
    if (cached) {
      this.renderIssue(popover, cached);
      this.place(popover, anchor);
      return;
    }
    if (!this.plugin.settings.githubToken.trim()) {
      this.renderMessage(popover, ref, "Add a GitHub token in settings to load the preview.");
      this.place(popover, anchor);
      return;
    }

    this.renderMessage(popover, ref, "Loading…");
    this.place(popover, anchor);
    try {
      const issue = await this.plugin.github.fetchIssue(ref.owner, ref.name, ref.number);
      this.remember(issue);
      if (this.openUrl !== ref.url || !this.popover) return;
      this.renderIssue(this.popover, issue);
      this.place(this.popover, anchor);
    } catch (error) {
      if (this.openUrl !== ref.url || !this.popover) return;
      const text = error instanceof GitHubError ? error.message : "Could not load this issue.";
      this.renderMessage(this.popover, ref, text);
      this.place(this.popover, anchor);
    }
  }

  private ensurePopover(): HTMLElement {
    if (this.popover) return this.popover;
    const popover = document.body.createDiv({ cls: "gh-issue-popover" });
    popover.addEventListener("mouseenter", () => this.cancelHide());
    popover.addEventListener("mouseleave", () => this.scheduleHide());
    this.popover = popover;
    return popover;
  }

  private renderIssue(popover: HTMLElement, issue: GhIssue): void {
    popover.replaceChildren();
    const top = popover.createDiv({ cls: "gh-issue-pop-top" });
    top.createSpan({
      cls: `gh-issue-state ${issue.state === "OPEN" ? "is-open" : "is-closed"}`,
      text: issue.state === "OPEN" ? "Open" : "Closed",
    });
    const link = top.createEl("a", {
      cls: "gh-issue-pop-link",
      href: issue.url,
      text: "Open on GitHub",
    });
    link.setAttr("target", "_blank");
    link.setAttr("rel", "noopener");

    popover.createDiv({ cls: "gh-issue-pop-title", text: issue.title });
    popover.createDiv({ cls: "gh-issue-pop-repo", text: `${issue.repo}#${issue.number}` });

    if (issue.labels.length > 0) {
      const labels = popover.createDiv({ cls: "gh-issue-pop-labels" });
      for (const label of issue.labels) {
        const chip = labels.createSpan({ cls: "gh-issue-label", text: label.name });
        const color = safeHex(label.color);
        if (!color) continue;
        chip.setCssProps({
          "--gh-issue-label-bg": color,
          "--gh-issue-label-fg": contrastColor(color),
        });
      }
    }

    const updated = formatUpdated(issue.updatedAt);
    if (updated) popover.createDiv({ cls: "gh-issue-pop-updated", text: `Updated ${updated}` });

    const body = excerpt(issue.body);
    if (body) popover.createDiv({ cls: "gh-issue-pop-body", text: body });
  }

  private renderMessage(popover: HTMLElement, ref: IssueRef, message: string): void {
    popover.replaceChildren();
    const top = popover.createDiv({ cls: "gh-issue-pop-top" });
    top.createSpan({ cls: "gh-issue-pop-repo", text: `${ref.repo}#${ref.number}` });
    const link = top.createEl("a", {
      cls: "gh-issue-pop-link",
      href: ref.url,
      text: "Open on GitHub",
    });
    link.setAttr("target", "_blank");
    link.setAttr("rel", "noopener");
    popover.createDiv({ cls: "gh-issue-pop-message", text: message });
  }

  private place(popover: HTMLElement, anchor: HTMLElement): void {
    const rect = anchorRect(anchor, this.point);
    const margin = 8;
    popover.setCssProps({
      visibility: "hidden",
      left: "0px",
      top: "0px",
    });
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + margin;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (top + height > window.innerHeight - margin) top = rect.top - height - margin;
    popover.setCssProps({
      left: `${Math.max(margin, left)}px`,
      top: `${Math.max(margin, top)}px`,
      visibility: "visible",
    });
  }

  private clearShow(): void {
    if (this.showTimer !== null) window.clearTimeout(this.showTimer);
    this.showTimer = null;
  }

  private cancelHide(): void {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }
}

export function issueHoverExtension(hover: IssueHover): Extension {
  return EditorView.domEventHandlers({
    mouseover(event, view) {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest(".gh-issue-popover")) return;

      const anchor = event.target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        const ref = parseIssueUrl(anchor.getAttribute("href"));
        if (ref) {
          hover.scheduleShow(anchor, ref);
          return;
        }
      }

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) {
        hover.scheduleHide();
        return;
      }
      const line = view.state.doc.lineAt(pos);
      const ref = issueRefAtOffset(line.text, pos - line.from);
      if (!ref) {
        hover.scheduleHide();
        return;
      }
      hover.scheduleShow(event.target, ref, { x: event.clientX, y: event.clientY });
    },
  });
}

function anchorRect(anchor: HTMLElement, point: { x: number; y: number } | null): DOMRect {
  const rect = anchor.getBoundingClientRect();
  if (point && rect.width > 240) {
    return new DOMRect(point.x, point.y, 0, 16);
  }
  return rect;
}
