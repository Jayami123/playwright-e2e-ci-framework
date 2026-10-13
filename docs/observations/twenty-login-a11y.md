# Twenty login accessibility (observation)

- **Probe date:** 2026-10-13
- **Route:** `/welcome` (title: Sign in or Create an account)
- **Finding (probe):** Email and Password inputs had no `<label>` and no `aria-label`; placeholders were the only visible hint. On seeded Apple workspace sign-in (`Welcome, Apple.`), Chromium exposes `textbox` roles named `Email` and `Password`.
- **P1 stance:** Documented here only. Not a `test.fail` in the Twenty smoke spec.

**Locators in P1:** Prefer `getByRole("textbox")` when a single field is on screen; use `getByPlaceholder("Password")` for the password step if Chromium does not expose a named textbox role.
