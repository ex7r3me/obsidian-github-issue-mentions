# GitHub Issue Mentions

Mention GitHub issues from one project board while you write in Obsidian. The board can include issues from many repositories.

Type `gh#`, then an issue number or words from the title. Pick a result to insert a markdown link. Hover any GitHub issue link for a preview.

Issues you have linked before rank higher. Mentions you insert are remembered; the plugin does not read the rest of the vault.

## Install

### Obsidian community plugins

This plugin is not in the community plugin directory yet. Until it is, install it from a GitHub release.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/ex7r3me/obsidian-github-issue-mentions/releases/latest).
2. Create a folder named `github-issue-mentions` in your vault's `.obsidian/plugins` directory.
3. Put the three files in that folder.
4. Reload Obsidian and enable **GitHub Issue Mentions** in **Settings → Community plugins**.

### BRAT

You can also install it with the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin using `ex7r3me/obsidian-github-issue-mentions`.

## Use

1. Open **Settings → GitHub Issue Mentions**.
2. Paste a [fine-grained personal access token](https://github.com/settings/personal-access-tokens).
3. Set the organization that owns the project.
4. Click **Load projects** and choose the board.
5. In a note, type `gh#` and a number or title words, for example `gh# 139` or `gh# grafana`.

The command **Insert GitHub issue** inserts `gh#` at the cursor.

Choosing a result inserts a link:

```markdown
[#139 Short title](https://github.com/owner/repo/issues/139)
```

Hover that link, or any existing GitHub issue link, to see the state, title, repository, labels, updated date, and a short excerpt.

### Token permissions

Create the token for the organization that owns the project. Read-only access is enough.

- Repository access: all repositories on the board, or every repository in the organization
- Repository permissions: **Issues** Read-only. **Metadata** Read-only is added automatically
- Organization permissions: **Projects** Read-only

If the organization uses single sign-on, authorize the token for that organization.

The token is stored in this plugin's `data.json` in your vault. That file is not part of this repository.

## Develop

```bash
npm install
npm run check
npm run build
```

`npm run build` writes `main.js`. Obsidian loads `main.js`, `manifest.json`, and `styles.css`.

## License

[MIT](LICENSE)
