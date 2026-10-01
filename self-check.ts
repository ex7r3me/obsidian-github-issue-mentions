import assert from "node:assert/strict";
import { excerpt, formatIssueLink, issueRefAtOffset, parseGhTrigger, parseIssueUrl } from "./src/link.ts";
import { collectMentions, finishScan, mergeUsage, sanitizeUsage } from "./src/mentions.ts";
import { rankIssues } from "./src/rank.ts";
import type { GhIssue, UsageEntry } from "./src/types.ts";

function issue(partial: Partial<GhIssue> & Pick<GhIssue, "number" | "title" | "repo">): GhIssue {
  return {
    url: `https://github.com/${partial.repo}/issues/${partial.number}`,
    state: "OPEN",
    updatedAt: "2026-01-01T00:00:00Z",
    body: "",
    labels: [],
    ...partial,
  };
}

const grafana = issue({
  number: 29,
  title: "Grafana [timeout]",
  repo: "lolocompany/lolo-platform",
  state: "OPEN",
});
const closed = issue({
  number: 139,
  title: "DT errors",
  repo: "lolocompany/lolo-platform",
  state: "CLOSED",
});
const exact = issue({
  number: 2,
  title: "Unrelated board item",
  repo: "lolocompany/lolo-iac",
  state: "OPEN",
});

assert.equal(
  formatIssueLink(grafana),
  "[#29 Grafana timeout](https://github.com/lolocompany/lolo-platform/issues/29) ",
);

const parsed = parseIssueUrl("https://github.com/lolocompany/lolo-platform/issues/139#issuecomment-1");
assert.equal(parsed?.repo, "lolocompany/lolo-platform");
assert.equal(parsed?.number, 139);
assert.equal(parsed?.url, "https://github.com/lolocompany/lolo-platform/issues/139");

assert.equal(parseGhTrigger("xgh#139"), null);
assert.deepEqual(parseGhTrigger("gh#"), { query: "", start: 0 });
assert.deepEqual(parseGhTrigger("  gh# grafana"), { query: " grafana", start: 2 });
assert.equal(parseGhTrigger("see gh#foo bar")?.query, "foo bar");
assert.equal(parseGhTrigger("tag #foo gh#139")?.query, "139");

const line = "See [#139 DT errors](https://github.com/lolocompany/lolo-platform/issues/139) today";
const urlAt = line.indexOf("https://");
assert.equal(issueRefAtOffset(line, urlAt + 10)?.number, 139);
assert.equal(issueRefAtOffset(line, line.indexOf("#139"))?.number, 139);
assert.equal(issueRefAtOffset(line, 0), null);
assert.equal(issueRefAtOffset("https://github.com/lolocompany/lolo-iac/issues/1032", 10)?.number, 1032);

assert.equal(excerpt("## Hello\n\n`code` and [a link](https://example.com)"), "Hello code and a link");

const notes = [
  "Look at [#139 DT errors](https://github.com/lolocompany/lolo-platform/issues/139)",
  "Again https://github.com/lolocompany/lolo-platform/issues/139 and https://github.com/lolocompany/lolo-iac/issues/5",
].join("\n");
const counts = collectMentions(notes);
assert.equal(counts["lolocompany/lolo-platform#139"].count, 2);
assert.equal(counts["lolocompany/lolo-platform#139"].title, "DT errors");
assert.equal(counts["lolocompany/lolo-iac#5"].count, 1);

const previous: Record<string, UsageEntry> = {
  "lolocompany/lolo-platform#139": {
    ...counts["lolocompany/lolo-platform#139"],
    count: 9,
    lastUsed: 50,
  },
  "lolocompany/other#1": {
    url: "https://github.com/lolocompany/other/issues/1",
    repo: "lolocompany/other",
    number: 1,
    count: 4,
    lastUsed: 10,
  },
};
const merged = mergeUsage(counts, previous);
assert.equal(merged["lolocompany/lolo-platform#139"].count, 2);
assert.equal(merged["lolocompany/lolo-platform#139"].lastUsed, 50);
assert.equal(merged["lolocompany/other#1"], undefined);

const touched = finishScan(counts, previous, {
  "lolocompany/lolo-iac#9": {
    url: "https://github.com/lolocompany/lolo-iac/issues/9",
    repo: "lolocompany/lolo-iac",
    number: 9,
    title: "Fresh",
    count: 1,
    lastUsed: 99,
  },
});
assert.equal(touched["lolocompany/lolo-iac#9"].title, "Fresh");

const usage = {
  [grafana.repo + "#" + grafana.number]: {
    url: grafana.url,
    repo: grafana.repo,
    number: grafana.number,
    count: 5,
    lastUsed: 1,
  },
};
const ranked = rankIssues([exact, grafana, closed], "2", usage);
assert.equal(ranked[0].issue.number, 29);
assert.equal(ranked[1].issue.number, 2);

const sameUsage = rankIssues([closed, exact], "2", {});
assert.equal(sameUsage[0].issue.number, 2);

const openFirst = rankIssues(
  [
    issue({ number: 3, title: "Same", repo: "lolocompany/a", state: "CLOSED" }),
    issue({ number: 4, title: "Same", repo: "lolocompany/a", state: "OPEN" }),
  ],
  "",
  {},
);
assert.equal(openFirst[0].state ?? openFirst[0].issue.state, "OPEN");

const dirty = sanitizeUsage({
  bad: { url: "https://example.com", repo: "x/y", number: 1 },
  good: {
    url: "https://github.com/lolocompany/lolo-platform/issues/29",
    repo: "lolocompany/lolo-platform",
    number: 29,
    count: 3,
    lastUsed: 4,
  },
});
assert.equal(Object.keys(dirty).length, 1);
assert.equal(dirty.good.count, 3);

console.log("self-check ok");
