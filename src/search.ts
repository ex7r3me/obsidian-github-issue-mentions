import type { GitHubClient } from "./github";
import { GitHubError } from "./github";
import { topUsed } from "./mentions";
import { dedupeIssues, rankIssues } from "./rank";
import type { GhIssue, PluginSettings, Suggestion, UsageEntry } from "./types";

const EMPTY_LOOKUP_LIMIT = 8;

export async function searchProjectIssues(
  client: GitHubClient,
  settings: PluginSettings,
  usage: Record<string, UsageEntry>,
  query: string,
  signal: AbortSignal,
): Promise<Suggestion[]> {
  const owner = settings.owner.trim();
  if (!settings.githubToken.trim()) {
    return [{ kind: "message", text: "Set a GitHub token in plugin settings." }];
  }
  if (!owner) {
    return [{ kind: "message", text: "Set a GitHub organization in settings." }];
  }
  if (!settings.projectNumber) {
    return [{ kind: "message", text: "Choose a GitHub project in settings." }];
  }

  const typed = query.trim();
  const projectNumber = settings.projectNumber;
  let issues: GhIssue[];
  if (!typed) {
    issues = await searchMentionedOnProject(client, owner, projectNumber, usage, signal);
  } else {
    const result = await client.searchIssues(
      owner,
      projectNumber,
      [{ name: "g0", query: `is:issue ${typed}`, first: 30 }],
      signal,
    );
    issues = result.groups.get("g0") ?? [];
  }

  const ranked = rankIssues(issues, typed, usage);
  if (ranked.length === 0) {
    const name = settings.projectTitle || `project ${projectNumber}`;
    return [
      {
        kind: "message",
        text: typed ? `No matching issues in ${name}.` : `No issues found in ${name}.`,
      },
    ];
  }
  return ranked.map((item) => ({
    kind: "issue" as const,
    issue: item.issue,
    usageCount: item.usageCount,
  }));
}

async function searchMentionedOnProject(
  client: GitHubClient,
  owner: string,
  projectNumber: number,
  usage: Record<string, UsageEntry>,
  signal: AbortSignal,
): Promise<GhIssue[]> {
  const top = topUsed(usage, EMPTY_LOOKUP_LIMIT);
  const groups = [
    { name: "g0", query: "is:issue", first: 25 },
    ...top.map((entry, index) => ({
      name: `g${index + 1}`,
      query: `is:issue ${entry.number}`,
      first: 20,
    })),
  ];
  const generalGroup = groups[0];
  let result: Awaited<ReturnType<GitHubClient["searchIssues"]>>;
  try {
    result = await client.searchIssues(owner, projectNumber, groups, signal);
  } catch (error) {
    if (!generalGroup || groups.length === 1) throw error;
    if (!(error instanceof GitHubError) || error.kind === "auth" || error.kind === "missing") throw error;
    result = await client.searchIssues(owner, projectNumber, [generalGroup], signal);
  }

  const general = result.groups.get("g0") ?? [];
  const extras: GhIssue[] = [];
  top.forEach((entry, index) => {
    const found = result.groups.get(`g${index + 1}`) ?? [];
    for (const issue of found) {
      if (issue.repo === entry.repo && issue.number === entry.number) extras.push(issue);
    }
  });
  return dedupeIssues([...extras, ...general]);
}
