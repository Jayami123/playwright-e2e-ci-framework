# Contributing

## Branching

Never commit on `main`. Branch from an up-to-date `main`:

```text
<type>/YYYY-MM-DD-short-name
```

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `ci`, `docs`.

Open a pull request into `main` on [playwright-e2e-ci-framework](https://github.com/Jayami123/playwright-e2e-ci-framework). Do not merge from this workflow unless asked.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/). Subject under 72 characters. One concern per commit.

Examples:

```text
chore(tooling): add ESLint, Prettier, and Node 22 engines
test(cal): tag FW specs and assert event-type deletion
```

## Pull requests

- Use the [pull request template](.github/pull_request_template.md). Paste real command output and Playwright summary lines only; do not invent pass rates or durations.
- PR titles must follow Conventional Commits (same types as commits: `feat`, `fix`, `refactor`, `chore`, `test`, `ci`, `docs`). The **PR title** workflow checks the title on every PR update. On a single-commit PR, the commit message must be conventional too (squash merge uses the PR title when repo settings use "Pull request title").
- Keep product forks (`products/`) and `qa-portfolio-harness` out of this repo's diffs.
- Describe why the change exists.
- Before push: `npm run lint`, `npm run typecheck`, and `npm run test:cal` (twice when the suite changed).

## Code

- Cal specifics stay under `src/products/cal`. `src/core` stays product-agnostic.
- No `any`, non-null assertions, or unchecked casts. Prefer `import type` and readonly data.
- Playwright: web-first assertions, no sleeps, `getByRole` > `getByLabel` > `getByTestId` > `getByText`; no CSS/XPath.
- Every test is isolated and cleans up its own data.
