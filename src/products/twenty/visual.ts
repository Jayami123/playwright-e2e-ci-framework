import type { AxeAllowlistEntry } from "../../support/visual/axe.js";

/** Fixed seed ids (Step 0). */
export const TW_PERSON_ID = "20202020-b000-4485-94de-70c2a98daef2";
export const TW_PERSON_NAME = "Jeffery Griffin";
export const TW_COMPANY_ID = "20202020-a000-4485-94de-70c2a98daef2";
export const TW_PEOPLE_OPERATION = "FindManyPeople";

/** Body background per member colour scheme (Step 0). */
export const TW_BACKGROUND = {
  Light: "color(display-p3 0.945 0.945 0.945)",
  Dark: "color(display-p3 0.114 0.114 0.114)",
} as const;

/** Custom-object names from the seed and record data: data, not UI strings (Step 0). */
export const TW_PSEUDO_DATA: readonly string[] = [
  "Rockets",
  "Pets",
  "Survey results",
  "Employment Histories",
  "Pet Care Agreements",
  "Star History",
  "Apple",
];

export const TW_VIS002_CHIP_NO_ELLIPSIS_ISSUE =
  "PRODUCT BUG TW-VIS-002: a long company name in a person's People-list chip is cut mid-word with text-overflow: clip instead of an ellipsis (Phase 3 probe 2026-10-16)";
export const TW_VIS004_EMPTY_STATE_ISSUE =
  'PRODUCT BUG TW-VIS-004: a failed FindManyPeople query shows the empty state "No Person found" while the view header still counts the records (Phase 3 probe 2026-10-16)';
export const TW_I18N001_HEADER_TRUNCATED_ISSUE =
  "PRODUCT BUG TW-I18N-001: the German column header Berufsbezeichnung is truncated with an ellipsis at the default column width (Phase 3 probe 2026-10-16)";
export const TW_X01_PARTIAL_DATA_DISCARDED_ISSUE =
  "PRODUCT BUG TW-VIS-X01: a FindManyPeople response with data plus errors discards the real data and shows no rows (Phase 3 probe 2026-10-16)";
export const TW_X02_DUPLICATE_TOASTS_ISSUE =
  "PRODUCT BUG TW-VIS-X02: a failed FindManyPeople query shows the same error toast several times (retries are not de-duplicated; Phase 3 probe 2026-10-16)";
export const TW_X05_NO_COLUMNHEADERS_ISSUE =
  "PRODUCT BUG TW-VIS-X05: the People table exposes no columnheader roles (WCAG 1.3.1, Phase 3 probe 2026-10-16)";

/** Finding ids (text before the first colon) that apply to each scanned page. */
export const TW_PEOPLE_FINDINGS: ReadonlySet<string> = new Set([
  "PRODUCT BUG TW-VIS-001-F1",
  "PRODUCT BUG TW-VIS-001-F2",
  "PRODUCT BUG TW-VIS-001-F3",
  "PRODUCT BUG TW-VIS-001-F4",
  "PRODUCT BUG TW-VIS-X06-F7",
  "PRODUCT BUG TW-VIS-X06-F8",
  "PRODUCT BUG TW-VIS-X06-F9",
  "PRODUCT BUG TW-VIS-X06-F10",
  "PRODUCT BUG TW-VIS-X06-F11",
]);
export const TW_PERSON_FINDINGS: ReadonlySet<string> = new Set([
  "PRODUCT BUG TW-VIS-001-F2",
  "PRODUCT BUG TW-VIS-001-F5",
  "PRODUCT BUG TW-VIS-001-F6",
  "PRODUCT BUG TW-VIS-X06-F12",
  "PRODUCT BUG TW-VIS-X06-F13",
  "PRODUCT BUG TW-VIS-X06-F14",
]);

/** Step 0 axe nodes. The s... classes are build hashes of twentycrm/twenty:v2.44.0; a bump makes them stale. */
export const TWENTY_AXE_ALLOWLIST: readonly AxeAllowlistEntry[] = [
  {
    rule: "color-contrast",
    // hashed v2.44.0 class: the "· 1,200" count span has no testid, role or id (Step 0 outerHTML `<span class="s1oavrdv">`).
    target: ".s1oavrdv",
    finding: "PRODUCT BUG TW-VIS-001-F1: view row count '· 1,200' light 2.09:1, dark 3.12:1",
  },
  {
    rule: "color-contrast",
    // Source-level class name (`section-title-label`), not a hash; the node has no testid or role.
    target: ".section-title-label",
    finding: "PRODUCT BUG TW-VIS-001-F2: sidebar 'Workspace' label light 1.99:1, dark 3.06:1",
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "color-contrast",
    // hashed v2.44.0 class: header label spans carry only a per-render `base-ui-_r_*_` id and the generic
    // `data-base-ui-tooltip-trigger` attribute (shared by other tooltips), so the hash is the narrowest stable match.
    target: ".s1ahrbok",
    finding: "PRODUCT BUG TW-VIS-001-F3: column header labels #999 on #fff 2.84:1",
    contexts: ["light", "wcag"],
  },
  {
    rule: "color-contrast",
    // Stable: aggregate labels have data-testid="tooltip"; the "Calculate" span has id "tooltip-<uuid>-footer".
    target: '[data-testid="tooltip"], [id^="tooltip-"][id$="-footer"]',
    finding: "PRODUCT BUG TW-VIS-001-F4: table footer aggregate labels 2.84:1",
    contexts: ["light", "wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "color-contrast",
    // Scoped by data-testid="top-bar-title"; hashed v2.44.0 class for the inner breadcrumb div (no own testid/role).
    target: '[data-testid="top-bar-title"] .s1wv6onj',
    finding: "PRODUCT BUG TW-VIS-001-F5: record breadcrumb 'People /' light 2.77:1, dark 4.42:1",
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "color-contrast",
    // Scoped by data-testid="top-bar-title"; hashed v2.44.0 class for the position span (no own testid/role).
    target: '[data-testid="top-bar-title"] .s1oujbzf',
    finding: "PRODUCT BUG TW-VIS-001-F6: record position '(442/1,200)' light 2.77:1, dark 4.42:1",
    viewports: ["visual-tablet", "visual-desktop"],
  },
  // TW-VIS-X06 (selectors read from the first Docker X06 run, reviewed and approved 2026-10-16).
  // All use ARIA attributes; source-level class names (record-table-column-*, footer-cell) only scope them.
  {
    rule: "aria-command-name",
    target: '.record-table-column-drag-and-drop [role="button"][aria-roledescription="draggable"]',
    finding: "PRODUCT BUG TW-VIS-X06-F7: People row drag handle has no accessible name",
    contexts: ["wcag"],
  },
  {
    rule: "aria-command-name",
    target: '.record-table-column-add-column-button [role="button"][aria-haspopup="true"]',
    finding: "PRODUCT BUG TW-VIS-X06-F8: People add-column header button has no accessible name",
    contexts: ["wcag"],
  },
  {
    rule: "aria-command-name",
    target: '.footer-cell [role="button"][aria-haspopup="dialog"]',
    finding: "PRODUCT BUG TW-VIS-X06-F9: People footer aggregate trigger has no accessible name",
    contexts: ["wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "aria-toggle-field-name",
    target: '.record-table-column-checkbox [role="checkbox"]',
    finding: "PRODUCT BUG TW-VIS-X06-F10: People row-select checkboxes have no accessible name",
    contexts: ["wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "nested-interactive",
    target:
      '[role="button"][aria-haspopup="true"][aria-controls^="view-bar-main-filter-dropdown"], [role="button"][aria-haspopup="true"][aria-controls^="object-options-dropdown"]',
    finding:
      "PRODUCT BUG TW-VIS-X06-F11: People view-bar Filter and Options triggers nest controls",
    contexts: ["wcag"],
  },
  {
    rule: "aria-allowed-attr",
    target: '[role="none"][aria-roledescription="draggable"]',
    finding: "PRODUCT BUG TW-VIS-X06-F12: person widget wrappers use aria-pressed on role=none",
    contexts: ["wcag"],
  },
  {
    rule: "nested-interactive",
    target: '[role="button"][aria-haspopup="true"][aria-controls^="record-field-card-"]',
    finding: "PRODUCT BUG TW-VIS-X06-F13: person widget-card menu triggers nest controls",
    contexts: ["wcag"],
  },
  {
    // Not in the first X06 run: the tablet person page also renders the tab-overflow menu trigger
    // (aria-controls "tab-overflow-<uuid>-tab-list-2"), found by the build's verification runs.
    rule: "nested-interactive",
    target: '[role="button"][aria-haspopup="true"][aria-controls^="tab-overflow-"]',
    finding: "PRODUCT BUG TW-VIS-X06-F14: person tab-overflow menu trigger nests controls",
    contexts: ["wcag"],
    viewports: ["visual-tablet"],
  },
];
