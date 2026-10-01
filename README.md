# GitHub Issue Mentions

Search one GitHub Project from a note. Type `gh#`, pick an issue, and insert a link. Hover any GitHub issue link for a preview.

The project can include issues from many repositories. Issues you have linked before appear first.

**[Install in Obsidian](obsidian://show-plugin?id=github-issue-mentions)** · [Plugin page](https://community.obsidian.md/plugins/github-issue-mentions)

## Install

1. Open **Settings → Community plugins**.
2. Turn off Restricted mode if Obsidian asks you to.
3. Choose **Browse**, search for **GitHub Issue Mentions**, then **Install** and **Enable**.

Obsidian 1.13 or newer. Desktop and mobile.

### Install from a release

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/ex7r3me/obsidian-github-issue-mentions/releases/latest).
2. Put them in a folder named `github-issue-mentions` inside your vault's `.obsidian/plugins` directory.
3. Reload Obsidian and enable **GitHub Issue Mentions**.

## Set up

1. Open **Settings → GitHub Issue Mentions**.
2. Paste a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new).
3. Enter the organization that owns the project.
4. Choose **Load projects**, then pick the board.

### Token

Create the token for that organization. Read-only access is enough.

| Where | What to allow |
| --- | --- |
| Repository access | Every repository on the board |
| Repository permissions | **Issues**: Read-only. **Metadata**: Read-only is added automatically |
| Organization permissions | **Projects**: Read-only |

If the organization uses single sign-on, authorize the token for that organization.

The token is stored in this plugin's `data.json` in your vault and is used only to read the project and its issues from GitHub.

## Mention an issue

In a note, type `gh#`, then an issue number or words from the title.

| You type | The list shows |
| --- | --- |
| `gh# 139` | Issue 139 on the board |
| `gh# grafana` | Issues whose titles match those words |

Pick a result. The plugin inserts a markdown link:

```markdown
[#139 Short title](https://github.com/owner/repo/issues/139)
```

The command **Insert GitHub issue** types `gh#` at the cursor.

Issues you insert are remembered and listed higher next time.

## Preview

Hover a GitHub issue link in reading view, live preview, or source mode. The card shows:

- Whether the issue is open or closed
- Title and `owner/repo#number`
- Labels
- When it was last updated
- A short excerpt

Move the pointer away and the card closes. Press Escape to close it right away.

## Develop

```bash
npm install
npm run check
npm run build
```

`npm run build` writes `main.js`. Obsidian loads `main.js`, `manifest.json`, and `styles.css`.

## License

[MIT](LICENSE)
