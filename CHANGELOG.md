# Changelog

## Unreleased

- Harness pinned to v0.2.9 (Medusa adapter). CI stubs `products/medusa-dtc-starter` (the v0.2.9 default Medusa root) instead of `products/medusa`. No Medusa tests yet.
- Visual CI: a `visual:test` Docker step in each product job and an `e2e / visual` aggregator that fails when a requested visual run did not pass.
- `Update visual baselines` workflow: regenerates one product's baselines on a feature branch and uploads the changed PNGs for review (never commits).
- GitHub Pages publishes the merged report with traces and videos removed, behind a secret-scan gate.
- Documenso (VIS-001..005, X01..X07) and Twenty (VIS-001..004, I18N-001..002, X01..X06) visual, i18n and a11y cases, with committed bug evidence.
- Browser installs and apt downloads retry on transient failures.
