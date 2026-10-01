export interface PluginSettings {
  githubToken: string;
  owner: string;
  projectNumber: number | null;
  projectTitle: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  githubToken: "",
  owner: "",
  projectNumber: null,
  projectTitle: "",
};

export interface GhLabel {
  name: string;
  color: string;
}

export interface GhIssue {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED";
  updatedAt: string;
  body: string;
  repo: string;
  labels: GhLabel[];
}

export interface GhProject {
  number: number;
  title: string;
  closed: boolean;
}

export interface IssueRef {
  owner: string;
  name: string;
  repo: string;
  number: number;
  url: string;
}

export interface UsageEntry {
  url: string;
  repo: string;
  number: number;
  title?: string;
  count: number;
  lastUsed: number;
}

export type Suggestion =
  | { kind: "issue"; issue: GhIssue; usageCount: number }
  | { kind: "message"; text: string };
