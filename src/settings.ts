import { Notice, PluginSettingTab, Setting, type App, type SettingDefinitionItem } from "obsidian";
import { GitHubError } from "./github";
import type GitHubIssueMentionsPlugin from "./main";

export class IssueSettingTab extends PluginSettingTab {
  private loadingProjects = false;

  constructor(app: App, private readonly plugin: GitHubIssueMentionsPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "How to mention an issue",
        desc: "Type gh# in a note, then an issue number or words from the title. Pick a result to insert a link. Hover a GitHub issue link for a preview.",
      },
      {
        name: "Personal access token",
        desc: "Stored in this plugin's data.json. The token needs read access to organization projects and to issues on the repositories on that board.",
        aliases: ["github token", "pat"],
        render: (setting: Setting) => {
          this.renderToken(setting);
        },
      },
      {
        name: "Organization",
        desc: "GitHub organization that owns the project board. Issues are searched across every repository on that board.",
        aliases: ["github org", "owner"],
        control: {
          type: "text",
          key: "owner",
          placeholder: "your-org",
        },
      },
      {
        name: "Project",
        desc: this.statusText(),
        aliases: ["board"],
        control: {
          type: "dropdown",
          key: "projectNumber",
          options: this.projectOptions(),
        },
      },
      {
        name: this.loadingProjects ? "Loading projects…" : "Load projects",
        desc: "Fetch the open projects for the organization above.",
        action: () => {
          void this.loadProjects();
        },
        disabled: this.loadingProjects,
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "owner") return this.plugin.settings.owner;
    if (key === "projectNumber") {
      return this.plugin.settings.projectNumber ? String(this.plugin.settings.projectNumber) : "";
    }
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "owner" && typeof value === "string") {
      this.plugin.settings.owner = value.trim();
    } else if (key === "projectNumber") {
      this.applyProject(typeof value === "string" ? value : "");
    }
    await this.plugin.saveAll();
    if (key === "owner") this.update();
  }

  private renderToken(setting: Setting): void {
    let input: HTMLInputElement | null = null;
    setting
      .addText((text) => {
        input = text.inputEl;
        text.inputEl.type = "password";
        text
          .setPlaceholder("Paste a token")
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (next) => {
            this.plugin.settings.githubToken = next.trim();
            await this.plugin.saveAll();
          });
      })
      .addExtraButton((button) => {
        let visible = false;
        const apply = () => {
          button.setIcon(visible ? "eye-off" : "eye").setTooltip(visible ? "Hide token" : "Show token");
        };
        apply();
        button.onClick(() => {
          if (!input) return;
          visible = !visible;
          input.type = visible ? "text" : "password";
          apply();
        });
      });
  }

  private projectOptions(): Record<string, string> {
    const options: Record<string, string> = {};
    const choices =
      this.plugin.choicesOwner === this.plugin.settings.owner ? this.plugin.projectChoices : null;
    options[""] = choices?.length ? "Select a project" : "Load projects to choose";
    for (const project of choices ?? []) {
      options[String(project.number)] = project.title;
    }
    const selected = this.plugin.settings.projectNumber;
    if (selected !== null && options[String(selected)] === undefined) {
      options[String(selected)] = this.plugin.settings.projectTitle
        ? `${this.plugin.settings.projectTitle} (#${selected})`
        : `Project #${selected}`;
    }
    return options;
  }

  private applyProject(value: string): void {
    if (!value) {
      this.plugin.settings.projectNumber = null;
      this.plugin.settings.projectTitle = "";
      return;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      this.plugin.settings.projectNumber = null;
      this.plugin.settings.projectTitle = "";
      return;
    }
    this.plugin.settings.projectNumber = number;
    const choices =
      this.plugin.choicesOwner === this.plugin.settings.owner ? this.plugin.projectChoices : null;
    const project = (choices ?? []).find((item) => item.number === number);
    if (project) this.plugin.settings.projectTitle = project.title;
  }

  private async loadProjects(): Promise<void> {
    if (this.loadingProjects) return;
    const owner = this.plugin.settings.owner.trim();
    if (!this.plugin.settings.githubToken.trim()) {
      this.plugin.projectLoadError = "Set a GitHub token before loading projects.";
      new Notice(this.plugin.projectLoadError);
      this.update();
      return;
    }
    if (!owner) {
      this.plugin.projectLoadError = "Set a GitHub organization before loading projects.";
      new Notice(this.plugin.projectLoadError);
      this.update();
      return;
    }

    this.loadingProjects = true;
    this.update();
    try {
      const projects = await this.plugin.github.listProjects(owner);
      this.plugin.projectChoices = projects;
      this.plugin.choicesOwner = owner;
      this.plugin.projectLoadError = "";
      const selected = projects.find((project) => project.number === this.plugin.settings.projectNumber);
      if (selected) {
        this.plugin.settings.projectTitle = selected.title;
        await this.plugin.saveAll();
      }
      new Notice(
        projects.length === 0
          ? `No open projects found for ${owner}.`
          : `Loaded ${projects.length} open projects.`,
      );
    } catch (error) {
      const message = error instanceof GitHubError ? error.message : "Could not load GitHub projects.";
      this.plugin.projectLoadError = message;
      new Notice(message);
    } finally {
      this.loadingProjects = false;
      this.update();
    }
  }

  private statusText(): string {
    if (this.plugin.projectLoadError) return this.plugin.projectLoadError;
    const number = this.plugin.settings.projectNumber;
    const title = this.plugin.settings.projectTitle;
    if (number && title) return `Using "${title}" (#${number}).`;
    if (number) return `Using project #${number}.`;
    return "Load projects, then choose the board to search.";
  }
}
