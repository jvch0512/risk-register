import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { csv, findings, heatmap, markdown, rating, score, validate, ValidationError, type Risk } from "../src/index.js";

const base: Risk = { id: "R-1", title: "t", owner: "o", likelihood: 3, impact: 3, treatment: "mitigate", controls: ["c"], lastReview: "2026-01-01" };
const today = new Date("2026-03-01");

test("rating thresholds", () => {
  assert.deepEqual([1, 5, 6, 11, 12, 19, 20, 25].map(rating), ["low", "low", "medium", "medium", "high", "high", "critical", "critical"]);
});

test("residual defaults to inherent and reduction is computed", () => {
  const [a] = score([base], today);
  assert.equal(a!.inherent, 9);
  assert.equal(a!.residual, 9);
  assert.equal(a!.reduction, 0);
  const [b] = score([{ ...base, residualLikelihood: 1, residualImpact: 3 }], today);
  assert.equal(b!.residual, 3);
  assert.equal(b!.reduction, 67);
});

test("sorted by residual then inherent then id", () => {
  const s = score([{ ...base, id: "B" }, { ...base, id: "A" }, { ...base, id: "C", likelihood: 5, impact: 5 }], today);
  assert.deepEqual(s.map((r) => r.id), ["C", "A", "B"]);
});

test("overdue uses 90 days, or 30 for critical residual, or the explicit cadence", () => {
  const d = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  assert.equal(score([{ ...base, lastReview: d(100) }], today)[0]!.overdueDays, 10);
  assert.equal(score([{ ...base, lastReview: d(40), likelihood: 5, impact: 5 }], today)[0]!.overdueDays, 10);
  assert.equal(score([{ ...base, lastReview: d(40), reviewEveryDays: 60 }], today)[0]!.overdueDays, 0);
});

test("findings flag accepted high risk, missing controls, worse residual, overdue", () => {
  const s = score([
    { ...base, id: "A", treatment: "accept", likelihood: 4, impact: 4 },
    { ...base, id: "B", controls: [] },
    { ...base, id: "C", residualLikelihood: 5, residualImpact: 5 },
    { ...base, id: "D", lastReview: "2025-01-01" },
  ], today);
  const f = findings(s).join("\n");
  assert.match(f, /A: high residual risk is accepted/);
  assert.match(f, /B: treatment is mitigate but no controls/);
  assert.match(f, /C: residual score is higher/);
  assert.match(f, /D: review overdue/);
});

test("validate collects every problem", () => {
  assert.throws(() => validate({}), ValidationError);
  try {
    validate([{ id: "X", title: "", owner: "o", likelihood: 6, impact: 2, treatment: "ignore", lastReview: "yesterday", residualLikelihood: 2 }, { id: "X", title: "t", owner: "o", likelihood: 1, impact: 1, treatment: "accept", lastReview: "2026-02-30x" }]);
    assert.fail("should throw");
  } catch (e) {
    const m = (e as Error).message;
    for (const part of ["title is required", "likelihood must be", "treatment must be", "lastReview must be", "set both residual", "duplicate id"]) assert.ok(m.includes(part), part + "\n" + m);
  }
});

test("heat map places ids by residual position", () => {
  const h = heatmap(score([{ ...base, id: "R-9", likelihood: 5, impact: 5, residualLikelihood: 2, residualImpact: 4 }], today));
  const row4 = h.split("\n").find((l) => l.startsWith("| 4 |"))!;
  assert.equal(row4, "| 4 | · | R-9 | · | · | · |");
});

test("CSV neutralises formulas and quotes commas", () => {
  const out = csv(score([{ ...base, title: '=HYPERLINK("x")' }, { ...base, id: "R-2", title: "a, b" }], today));
  assert.ok(out.includes(`"'=HYPERLINK(""x"")"`), out);
  assert.ok(out.includes('"a, b"'));
  assert.ok(!/^=/m.test(out));
});

test("markdown escapes pipes and lists findings", () => {
  const md = markdown(score([{ ...base, title: "a|b", controls: [] }], today), today);
  assert.ok(md.includes("a\\|b"));
  assert.ok(md.includes("no controls"));
});

test("CLI: sample file, strict exit code and bad input", () => {
  const out = execFileSync("node", ["dist/src/cli.js", "samples/risks.json", "--today", "2026-03-10"], { encoding: "utf8" });
  assert.ok(out.includes("R-01") && out.includes("Residual heat map"));
  const strict = spawnSync("node", ["dist/src/cli.js", "samples/risks.json", "--today", "2026-03-10", "--strict"], { encoding: "utf8" });
  assert.equal(strict.status, 1);
  assert.equal(spawnSync("node", ["dist/src/cli.js"], { encoding: "utf8" }).status, 2);
  assert.equal(spawnSync("node", ["dist/src/cli.js", "samples/risks.json", "--format", "xml"], { encoding: "utf8" }).status, 2);
  const csvOut = execFileSync("node", ["dist/src/cli.js", "samples/risks.json", "--format", "csv", "--today", "2026-03-10"], { encoding: "utf8" });
  assert.ok(csvOut.startsWith("id,title,owner"));
  assert.ok(JSON.parse(readFileSync("samples/risks.json", "utf8")).length === 5);
});
