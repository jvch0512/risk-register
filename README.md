# risk-register

A small, dependency-free tool that turns a JSON list of security risks into a scored register: inherent and residual risk on a 5x5 matrix, risk reduction per control set, a residual heat map, overdue review detection and Markdown, CSV or JSON export. Useful for ISO 27001 style risk assessments and for demonstrating GRC thinking in code.

> Built with AI assistance (Claude) as part of a security portfolio. Sample risks are fictional.

## Usage

```bash
npm ci && npm run build
node dist/src/cli.js samples/risks.json                       # Markdown report
node dist/src/cli.js samples/risks.json --format csv > r.csv  # open in Excel
node dist/src/cli.js samples/risks.json --strict              # exit 1 if there are findings
```

Exit codes: 0 ok, 1 findings with `--strict`, 2 usage or invalid input (every validation problem is listed at once).

## Model

Score = likelihood x impact (1-5 each). Ratings: 1-5 low, 6-11 medium, 12-19 high, 20-25 critical. Residual uses `residualLikelihood` and `residualImpact`; when absent it equals inherent. Review cadence defaults to 90 days, or 30 days when residual risk is critical, and can be set per risk.

Findings flag: high or critical residual risk that is merely accepted, mitigation with no listed controls, residual higher than inherent, and overdue reviews.

## Safety details

CSV cells that start with `=`, `+`, `-` or `@` are prefixed with a quote to prevent spreadsheet formula injection. Pipes in text are escaped in Markdown tables.

## Tests

`npm test` (strict TypeScript, node:test) covers thresholds, sorting, cadence, findings, validation, heat map, CSV safety and the CLI. CI runs on Node 20 and 22.

MIT licensed.
