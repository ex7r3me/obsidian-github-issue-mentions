import { Notice, PluginSettingTab, Setting, type App } from "obsidian";
import { GitHubError } from "./github";
import type GitHubIssueMentionsPlugin from "./main";

export class IssueSettingTab extends PluginSettingTab {
  private loadingProjects = false;

  constructor(app: App, private readonly plugin: GitHubIssueMentionsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      cls: "gh-issue-setting-intro",
      text: "Type gh# in a note, then an issue number or words from the title. Pick a result to insert a link. Hover a GitHub issue link for a preview.",
    });

    let tokenInput: HTMLInputElement | null = null;
    new Setting(containerEl)
      .setName("Personal access token")
      .setDesc(
        "Stored in this plugin's data.json. The token needs read access to organization projects and to issues on the repositories on that board.",
      )
      .addText((text) => {
        tokenInput = text.inputEl;
        text.inputEl.type = "password";
        text
          .setPlaceholder("Paste a token")
          .setValue(this.plugin.settings.githubToken)
          .onChange(async (value) => {
            this.plugin.settings.githubToken = value.trim();
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
          if (!tokenInput) return;
          visible = !visible;
          tokenInput.type = visible ? "text" : "password";
          apply();
        });
      });

    new Setting(containerEl)
      .setName("Organization")
      .setDesc("GitHub organization that owns the project board. Issues are searched across every repository on that board.")
      .addText((text) => {
        text
          .setPlaceholder("your-org")
          .setValue(this.plugin.settings.owner)
          .onChange(async (value) => {
            this.plugin.settings.owner = value.trim();
            await this.plugin.saveAll();
          });
      });

    const projectSetting = new Setting(containerEl)
      .setName("Project")
      .setDesc(this.statusText())
      .addDropdown((dropdown) => {
        const choices =
          this.plugin.choicesOwner === this.plugin.settings.owner ? this.plugin.projectChoices : null;
        dropdown.addOption("", choices?.length ? "Select a project" : "Load projects to choose");
        const listed = new Set<number>();
        for (const project of choices ?? []) {
          dropdown.addOption(String(project.number), project.title);
          listed.add(project.number);
        }
        const selected = this.plugin.settings.projectNumber;
        if (selected && !listed.has(selected)) {
          const label = this.plugin.settings.projectTitle
            ? `${this.plugin.settings.projectTitle} (#${selected})`
            : `Project #${selected}`;
          dropdown.addOption(String(selected), label);
        }
        dropdown.setValue(selected ? String(selected) : "");
        dropdown.onChange(async (value) => {
          if (!value) {
            this.plugin.settings.projectNumber = null;
            this.plugin.settings.projectTitle = "";
          } else {
            const number = Number(value);
            const project = (choices ?? []).find((item) => item.number === number);
            this.plugin.settings.projectNumber = Number.isFinite(number) ? number : null;
            if (project) this.plugin.settings.projectTitle = project.title;
          }
          await this.plugin.saveAll();
          projectSetting.setDesc(this.statusText());
        });
      })
      .addButton((button) => {
        button
          .setButtonText(this.loadingProjects ? "Loading…" : "Load projects")
          .setCta()
          .setDisabled(this.loadingProjects)
          .onClick(async () => {
            if (this.loadingProjects) return;
            this.loadingProjects = true;
            this.display();
            await this.loadProjects();
            this.loadingProjects = false;
            this.display();
          });
      });
  }

  private async loadProjects(): Promise<void> {
    const owner = this.plugin.settings.owner.trim();
    if (!this.plugin.settings.githubToken.trim()) {
      this.plugin.projectLoadError = "Set a GitHub token before loading projects.";
      new Notice(this.plugin.projectLoadError);
      return;
    }
    if (!owner) {
      this.plugin.projectLoadError = "Set a GitHub organization before loading projects.";
      new Notice(this.plugin.projectLoadError);
      return;
    }

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
