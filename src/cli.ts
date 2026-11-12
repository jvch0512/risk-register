#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { csv, findings, markdown, score, validate, ValidationError } from "./index.js";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const value = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--today" && args[i - 1] !== "--format");

if (!file) {
  console.error("usage: risk-register <risks.json> [--format md|csv|json] [--today YYYY-MM-DD] [--strict]\n  --strict exits 1 when there are findings");
  process.exit(2);
}
try {
  const today = value("--today") ? new Date(value("--today") as string) : new Date();
  if (Number.isNaN(today.getTime())) throw new ValidationError("--today must be YYYY-MM-DD");
  const scored = score(validate(JSON.parse(readFileSync(file, "utf8"))), today);
  const fmt = value("--format") ?? "md";
  if (fmt === "csv") process.stdout.write(csv(scored));
  else if (fmt === "json") console.log(JSON.stringify({ risks: scored, findings: findings(scored) }, null, 2));
  else if (fmt === "md") process.stdout.write(markdown(scored, today));
  else throw new ValidationError("--format must be md, csv or json");
  process.exit(flag("--strict") && findings(scored).length ? 1 : 0);
} catch (e) {
  console.error(e instanceof ValidationError ? `invalid input:\n${e.message}` : `error: ${(e as Error).message}`);
  process.exit(2);
}
