## Why

<!-- Problem, link to P1 case IDs, issue, or ADR -->

## What changed

<!-- One bullet per commit or concern -->

## Linked cases

<!-- P1-CAL-… IDs touched, or "none" -->

## Bug classification

<!-- For any failure touched: PRODUCT BUG or TEST BUG + evidence (trace/screenshot; Cal showed vs expected). Product bugs stay strict with test.fail + issue annotation. -->

## Verification

<!-- Real output only -->

- `npm run lint`:
- `npm run format:check`:
- `npm run typecheck`:
- `npm run test:unit`:
- `npm run test:cal` run 1 (Playwright summary line):
- `npm run test:cal` run 2 (Playwright summary line):
- CI run link + conclusion:

**Not verified**

<!-- List anything not run -->

## Scope / will NOT do

## Checklist

- [ ] Conventional PR title (squash-merged as the commit on `main`)
- [ ] No product-fork or harness edits in this PR
- [ ] Semantic locators only (`getByRole` > `getByLabel` > `getByTestId` > `getByText`; no CSS/XPath/nth)
- [ ] No sleeps; web-first assertions
- [ ] Oracle not weakened to match the app
- [ ] Test data isolated and cleaned up (DB counts 0 locally where applicable)
- [ ] No secrets, cookies, or storageState in traces, logs, or artifacts
- [ ] `docs/adr/` updated when behaviour or CI design changed
- [ ] Required check names unchanged (or called out in the PR body)
