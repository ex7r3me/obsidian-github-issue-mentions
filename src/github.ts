import { parseIssueUrl } from "./link";
import type { GhIssue, GhLabel, GhProject } from "./types";

const ENDPOINT = "https://api.github.com/graphql";

const ISSUE_FIELDS = `
  number
  title
  url
  state
  updatedAt
  body
  repository { nameWithOwner }
  labels(first: 6) { nodes { name color } }
`;

const LIST_PROJECTS = `
  query($login: String!, $after: String) {
    organization(login: $login) {
      projectsV2(first: 50, after: $after) {
        nodes { number title closed }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const FETCH_ISSUE = `
  query($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        ${ISSUE_FIELDS}
      }
    }
  }
`;

export type GitHubErrorKind = "auth" | "missing" | "api" | "network";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly kind: GitHubErrorKind,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

interface GraphQLErrorBody {
  message?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLErrorBody[];
}

interface RawLabel {
  name?: string | null;
  color?: string | null;
}

interface RawIssue {
  number?: number | null;
  title?: string | null;
  url?: string | null;
  state?: string | null;
  updatedAt?: string | null;
  body?: string | null;
  repository?: { nameWithOwner?: string | null } | null;
  labels?: { nodes?: (RawLabel | null)[] | null } | null;
}

interface RawItemConnection {
  nodes?: ({ content?: (RawIssue & { __typename?: string }) | null } | null)[] | null;
}

export interface ProjectSearchGroup {
  name: string;
  query: string;
  first: number;
}

interface ProjectsResponse {
  organization: {
    projectsV2: {
      nodes: ({ number?: number; title?: string; closed?: boolean } | null)[] | null;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  } | null;
}

interface ProjectItemsResponse {
  organization: {
    projectV2: ({ title?: string | null } & Record<string, RawItemConnection | string | null>) | null;
  } | null;
}

interface IssueResponse {
  repository: { issue: RawIssue | null } | null;
}

export class GitHubClient {
  constructor(private readonly token: () => string) {}

  async listProjects(owner: string, signal?: AbortSignal): Promise<GhProject[]> {
    const projects: GhProject[] = [];
    let after: string | null = null;
    for (let page = 0; page < 4; page++) {
      const data: ProjectsResponse = await this.query<ProjectsResponse>(
        LIST_PROJECTS,
        { login: owner, after },
        signal,
      );

      if (!data.organization) {
        throw new GitHubError(
          `No GitHub organization named "${owner}". Check the login in settings.`,
          "api",
        );
      }

      for (const node of data.organization.projectsV2.nodes ?? []) {
        if (!node || node.closed || typeof node.number !== "number") continue;
        projects.push({
          number: node.number,
          title: node.title?.trim() || `Project ${node.number}`,
          closed: false,
        });
      }

      if (!data.organization.projectsV2.pageInfo.hasNextPage) break;
      after = data.organization.projectsV2.pageInfo.endCursor;
      if (!after) break;
    }

    projects.sort((a, b) => a.title.localeCompare(b.title));
    return projects;
  }

  async searchIssues(
    owner: string,
    projectNumber: number,
    groups: ProjectSearchGroup[],
    signal?: AbortSignal,
  ): Promise<{ title: string; groups: Map<string, GhIssue[]> }> {
    if (groups.length === 0) {
      throw new GitHubError("Nothing to search.", "api");
    }
    const variableDefs = groups.map((group) => `$${alias(group.name)}: String!`).join(", ");
    const selections = groups
      .map((group) => {
        const name = alias(group.name);
        const first = clampFirst(group.first);
        return `
          ${name}: items(first: ${first}, query: $${name}) {
            nodes {
              content {
                __typename
                ... on Issue { ${ISSUE_FIELDS} }
              }
            }
          }
        `;
      })
      .join("\n");
    const document = `
      query($login: String!, $number: Int!, ${variableDefs}) {
        organization(login: $login) {
          projectV2(number: $number) {
            title
            ${selections}
          }
        }
      }
    `;
    const variables: Record<string, unknown> = {
      login: owner,
      number: projectNumber,
    };
    for (const group of groups) variables[alias(group.name)] = group.query;

    const data: ProjectItemsResponse = await this.query<ProjectItemsResponse>(document, variables, signal);

    if (!data.organization) {
      throw new GitHubError(
        `No GitHub organization named "${owner}". Check the login in settings.`,
        "api",
      );
    }
    const project = data.organization.projectV2;
    if (!project) {
      throw new GitHubError(`Project ${projectNumber} was not found in ${owner}.`, "api");
    }

    const result = new Map<string, GhIssue[]>();
    for (const group of groups) {
      const connection = project[alias(group.name)];
      result.set(group.name, issuesFromConnection(isItemConnection(connection) ? connection : null));
    }
    return {
      title: typeof project.title === "string" ? project.title : "",
      groups: result,
    };
  }

  async fetchIssue(owner: string, name: string, number: number, signal?: AbortSignal): Promise<GhIssue> {
    const data: IssueResponse = await this.query<IssueResponse>(
      FETCH_ISSUE,
      { owner, name, number },
      signal,
    );

    const issue = mapIssue(data.repository?.issue ?? null);
    if (!issue) {
      throw new GitHubError("Issue not found, or the token cannot read it.", "api");
    }
    return issue;
  }

  private async query<T>(
    document: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = this.token().trim();
    if (!token) {
      throw new GitHubError("Set a GitHub token in plugin settings.", "missing");
    }

    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "User-Agent": "obsidian-github-issue-mentions",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ query: document, variables }),
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new GitHubError("Could not reach GitHub.", "network");
    }

    const payload = (await response.json().catch(() => null)) as GraphQLResponse<T> | null;
    const errorText = payload?.errors?.map((error) => error.message ?? "").join(" ") ?? "";
    if (/rate limit/i.test(errorText)) {
      throw new GitHubError("GitHub rate limit reached. Wait a moment and try again.", "api");
    }
    if (response.status === 401 || response.status === 403) {
      throw new GitHubError(
        "GitHub rejected the token, or it cannot access this organization.",
        "auth",
      );
    }
    if (!response.ok || !payload) {
      throw new GitHubError(`GitHub request failed (${response.status}).`, "api");
    }
    if (payload.errors?.length) {
      const auth = /credential|unauthor|token|not accessible|forbidden|sso|saml/i.test(errorText);
      throw new GitHubError(
        auth
          ? "GitHub rejected the token, or it cannot access this organization."
          : errorText || "GitHub returned an error.",
        auth ? "auth" : "api",
      );
    }
    if (!payload.data) {
      throw new GitHubError("GitHub returned an empty response.", "api");
    }
    return payload.data;
  }
}

function alias(name: string): string {
  if (!/^g\d+$/.test(name)) throw new GitHubError("Invalid project search.", "api");
  return name;
}

function clampFirst(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.max(1, Math.min(30, Math.floor(value)));
}

function isItemConnection(value: unknown): value is RawItemConnection {
  return !!value && typeof value === "object" && "nodes" in value;
}

function issuesFromConnection(connection: RawItemConnection | null): GhIssue[] {
  const issues: GhIssue[] = [];
  for (const node of connection?.nodes ?? []) {
    const content = node?.content;
    if (!content || (content.__typename && content.__typename !== "Issue")) continue;
    const issue = mapIssue(content);
    if (issue) issues.push(issue);
  }
  return issues;
}

function mapIssue(raw: RawIssue | null): GhIssue | null {
  if (!raw?.url || typeof raw.number !== "number") return null;
  const parsed = parseIssueUrl(raw.url);
  const repo = raw.repository?.nameWithOwner || parsed?.repo;
  if (!repo || !parsed) return null;
  const labels: GhLabel[] = [];
  for (const label of raw.labels?.nodes ?? []) {
    if (!label?.name) continue;
    labels.push({ name: label.name, color: label.color ?? "" });
  }
  return {
    number: raw.number,
    title: raw.title?.trim() || `Issue ${raw.number}`,
    url: parsed.url,
    state: raw.state === "CLOSED" ? "CLOSED" : "OPEN",
    updatedAt: raw.updatedAt ?? "",
    body: (raw.body ?? "").slice(0, 1200),
    repo,
    labels,
  };
}
