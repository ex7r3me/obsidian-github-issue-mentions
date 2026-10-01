import { Plugin, type Editor } from "obsidian";
import { GitHubClient } from "./github";
import { issueHoverExtension, IssueHover } from "./hover";
import { searchProjectIssues } from "./search";
import { IssueSettingTab } from "./settings";
import { IssueSuggest } from "./suggest";
import { DEFAULT_SETTINGS, type GhIssue, type GhProject, type PluginSettings, type Suggestion } from "./types";
import { UsageIndex } from "./usage";

interface PluginData extends PluginSettings {
  usage?: unknown;
}

export default class GitHubIssueMentionsPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  usageIndex = new UsageIndex();
  github = new GitHubClient(() => this.settings.githubToken);
  hover = new IssueHover(this);
  projectChoices: GhProject[] | null = null;
  choicesOwner = "";
  projectLoadError = "";
  private suggest: IssueSuggest | null = null;
  private saveChain: Promise<void> = Promise.resolve();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.suggest = new IssueSuggest(this);
    this.addSettingTab(new IssueSettingTab(this.app, this));
    this.registerEditorSuggest(this.suggest);
    this.registerEditorExtension(issueHoverExtension(this.hover));
    this.registerMarkdownPostProcessor((element) => {
      this.hover.bindPreview(element);
    });
    this.addCommand({
      id: "insert-github-issue",
      name: "Insert GitHub issue",
      editorCallback: (editor: Editor) => {
        const cursor = editor.getCursor();
        const before = editor.getLine(cursor.line).slice(0, cursor.ch);
        const text = before.length > 0 && !/\s$/.test(before) ? " gh#" : "gh#";
        editor.replaceRange(text, cursor);
        editor.setCursor({ line: cursor.line, ch: cursor.ch + text.length });
      },
    });
    this.registerDomEvent(window, "keydown", (event) => {
      if (event.key === "Escape") this.hover.hide();
    });
    this.registerDomEvent(
      document,
      "scroll",
      (event) => {
        const target = event.target;
        if (target instanceof Node && this.hover.contains(target)) return;
        this.hover.hide();
      },
      { capture: true },
    );
    this.register(() => {
      this.suggest?.destroy();
      this.hover.destroy();
    });
  }

  async search(query: string, signal: AbortSignal): Promise<Suggestion[]> {
    return searchProjectIssues(this.github, this.settings, this.usageIndex.entries, query, signal);
  }

  rememberIssue(issue: GhIssue): void {
    this.hover.remember(issue);
  }

  recordUse(issue: GhIssue): void {
    this.usageIndex.record(issue);
    void this.saveAll();
  }

  async saveAll(): Promise<void> {
    const save = this.saveChain.catch(() => undefined).then(() =>
      this.saveData({
        ...this.settings,
        usage: this.usageIndex.entries,
      }),
    );
    this.saveChain = save;
    try {
      await save;
    } catch (error) {
      console.error("GitHub Issue Mentions failed to save settings", error);
    }
  }

  private async loadSettings(): Promise<void> {
    const data = ((await this.loadData()) ?? {}) as Partial<PluginData>;
    this.settings = {
      githubToken: typeof data.githubToken === "string" ? data.githubToken : DEFAULT_SETTINGS.githubToken,
      owner: typeof data.owner === "string" && data.owner.trim() ? data.owner.trim() : DEFAULT_SETTINGS.owner,
      projectNumber: typeof data.projectNumber === "number" && data.projectNumber > 0 ? data.projectNumber : null,
      projectTitle: typeof data.projectTitle === "string" ? data.projectTitle : "",
    };
    this.usageIndex.load(data.usage);
  }
}
