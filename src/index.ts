export type Level = 1 | 2 | 3 | 4 | 5;
export type Rating = "low" | "medium" | "high" | "critical";
export type Treatment = "mitigate" | "accept" | "transfer" | "avoid";

export interface Risk {
  id: string;
  title: string;
  owner: string;
  likelihood: Level;
  impact: Level;
  treatment: Treatment;
  /** Residual values after controls; omit when no control is in place yet. */
  residualLikelihood?: Level;
  residualImpact?: Level;
  controls?: string[];
  /** ISO date (YYYY-MM-DD) of the last review. */
  lastReview: string;
  /** Review cadence in days (default 90, 30 for critical). */
  reviewEveryDays?: number;
}

export interface Scored extends Risk {
  inherent: number;
  inherentRating: Rating;
  residual: number;
  residualRating: Rating;
  reduction: number;
  overdueDays: number;
}

const LEVELS = [1, 2, 3, 4, 5];

export function rating(score: number): Rating {
  if (score >= 20) return "critical";
  if (score >= 12) return "high";
  if (score >= 6) return "medium";
  return "low";
}

export class ValidationError extends Error {}

/** Validate untyped JSON into Risk[]. Collects all problems before throwing. */
export function validate(input: unknown): Risk[] {
  if (!Array.isArray(input)) throw new ValidationError("input must be a JSON array of risks");
  const problems: string[] = [];
  const ids = new Set<string>();
  const out: Risk[] = [];
  input.forEach((raw, i) => {
    const r = raw as Record<string, unknown>;
    const at = `risk[${i}]${typeof r?.id === "string" ? ` (${r.id})` : ""}`;
    if (typeof r !== "object" || r === null) { problems.push(`${at}: not an object`); return; }
    for (const k of ["id", "title", "owner"]) if (typeof r[k] !== "string" || !(r[k] as string).trim()) problems.push(`${at}: ${k} is required`);
    if (typeof r.id === "string") { if (ids.has(r.id)) problems.push(`${at}: duplicate id`); ids.add(r.id); }
    for (const k of ["likelihood", "impact"]) if (!LEVELS.includes(r[k] as number)) problems.push(`${at}: ${k} must be an integer 1-5`);
    for (const k of ["residualLikelihood", "residualImpact"]) if (r[k] !== undefined && !LEVELS.includes(r[k] as number)) problems.push(`${at}: ${k} must be an integer 1-5`);
    if ((r.residualLikelihood === undefined) !== (r.residualImpact === undefined)) problems.push(`${at}: set both residualLikelihood and residualImpact or neither`);
    if (!["mitigate", "accept", "transfer", "avoid"].includes(r.treatment as string)) problems.push(`${at}: treatment must be mitigate, accept, transfer or avoid`);
    if (typeof r.lastReview !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.lastReview) || Number.isNaN(Date.parse(r.lastReview))) problems.push(`${at}: lastReview must be YYYY-MM-DD`);
    if (r.reviewEveryDays !== undefined && !(Number.isInteger(r.reviewEveryDays) && (r.reviewEveryDays as number) > 0)) problems.push(`${at}: reviewEveryDays must be a positive integer`);
    out.push(r as unknown as Risk);
  });
  if (problems.length) throw new ValidationError(problems.join("\n"));
  return out;
}

const DAY = 86_400_000;

export function score(risks: Risk[], today: Date): Scored[] {
  return risks
    .map((r) => {
      const inherent = r.likelihood * r.impact;
      const residual = (r.residualLikelihood ?? r.likelihood) * (r.residualImpact ?? r.impact);
      const cadence = r.reviewEveryDays ?? (rating(residual) === "critical" ? 30 : 90);
      const age = Math.floor((today.getTime() - Date.parse(r.lastReview)) / DAY);
      return {
        ...r,
        inherent,
        inherentRating: rating(inherent),
        residual,
        residualRating: rating(residual),
        reduction: inherent === 0 ? 0 : Math.round(((inherent - residual) / inherent) * 100),
        overdueDays: Math.max(0, age - cadence),
      };
    })
    .sort((a, b) => b.residual - a.residual || b.inherent - a.inherent || a.id.localeCompare(b.id));
}

/** Findings worth a human's attention. */
export function findings(s: Scored[]): string[] {
  const out: string[] = [];
  for (const r of s) {
    if (r.treatment === "accept" && (r.residualRating === "high" || r.residualRating === "critical")) out.push(`${r.id}: ${r.residualRating} residual risk is accepted; needs explicit sign-off`);
    if (r.treatment === "mitigate" && (r.controls ?? []).length === 0) out.push(`${r.id}: treatment is mitigate but no controls are listed`);
    if (r.residual > r.inherent) out.push(`${r.id}: residual score is higher than inherent`);
    if (r.overdueDays > 0) out.push(`${r.id}: review overdue by ${r.overdueDays} day(s)`);
  }
  return out;
}

/** 5x5 text heat map of residual risk: rows impact 5..1, columns likelihood 1..5, cells list risk ids. */
export function heatmap(s: Scored[]): string {
  const cell = (l: number, im: number) => s.filter((r) => (r.residualLikelihood ?? r.likelihood) === l && (r.residualImpact ?? r.impact) === im).map((r) => r.id).join(",");
  const lines = ["| Impact \\ Likelihood | 1 | 2 | 3 | 4 | 5 |", "|---|---|---|---|---|---|"];
  for (let im = 5; im >= 1; im--) lines.push(`| ${im} | ${[1, 2, 3, 4, 5].map((l) => cell(l, im) || "·").join(" | ")} |`);
  return lines.join("\n");
}

export function markdown(s: Scored[], today: Date): string {
  const rows = s.map((r) => `| ${r.id} | ${r.title.replace(/\|/g, "\\|")} | ${r.owner} | ${r.inherent} (${r.inherentRating}) | ${r.residual} (${r.residualRating}) | ${r.reduction}% | ${r.treatment} |`);
  const f = findings(s);
  return [
    `# Risk register (${today.toISOString().slice(0, 10)})`,
    "",
    "| ID | Risk | Owner | Inherent | Residual | Reduction | Treatment |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Residual heat map",
    "",
    heatmap(s),
    "",
    "## Findings",
    "",
    ...(f.length ? f.map((x) => `- ${x}`) : ["- none"]),
    "",
  ].join("\n");
}

/** CSV with formula-injection protection: cells starting with = + - @ are prefixed with a quote. */
export function csv(s: Scored[]): string {
  const q = (v: string | number) => {
    let t = String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["id", "title", "owner", "inherent", "inherent_rating", "residual", "residual_rating", "reduction_pct", "treatment", "overdue_days"];
  return [head.join(","), ...s.map((r) => [r.id, r.title, r.owner, r.inherent, r.inherentRating, r.residual, r.residualRating, r.reduction, r.treatment, r.overdueDays].map(q).join(","))].join("\n") + "\n";
}
