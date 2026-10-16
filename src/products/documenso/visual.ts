import type { AxeAllowlistEntry } from "../../support/visual/axe.js";

export const DOC_VISUAL_TITLE = "QA visual baseline.pdf";
export const DOC_VISUAL_RECIPIENT_NAME = "QA Signer";
/** Exactly 200 chars (unit test asserts). */
export const DOC_LONG_TITLE =
  "QA long title Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agreement-renewal Quarterly-agre.pdf";
/** Exactly 80 chars (unit test asserts). */
export const DOC_LONG_RECIPIENT_NAME =
  "QA Recipient Longname-Check Longname-Check Longname-Check Longname-Check Longnam";
/** Step 0: GET /api/files/token/<t>/envelope/<e>/envelopeItem/<i>/dataId/<d>/current/item.pdf */
export const DOC_PDF_ROUTE =
  /\/api\/files\/token\/[^/]+\/envelope\/[^/]+\/envelopeItem\/[^/]+\/dataId\/[^/]+\/[^/]+\/item\.pdf(\?.*)?$/;
export const DOC_PDF_ERROR_TEXT = "Something went wrong while loading the document.";
export const DOC_PDF_TOAST_TEXT = "An error occurred while loading the document.";

export const DOC_X01_LONG_TITLE_OVERFLOW_ISSUE =
  "PRODUCT BUG DOC-VIS-X01: a 200-char document title on the signing page at >=768px is not truncated (whitespace-nowrap), the page scrolls horizontally and the primary action is pushed off-screen (Phase 3 probe 2026-10-16)";
export const DOC_X03_PDF_STALL_ISSUE =
  "PRODUCT BUG DOC-VIS-X03: a PDF request that never answers leaves an endless spinner with no error or timeout message (fetch has no timeout; Phase 3 probe 2026-10-16)";
export const DOC_X04_ZOOM_COMPLETE_ISSUE =
  "PRODUCT BUG DOC-VIS-X04: at 200% zoom (197 CSS px) the Complete button is clipped past the right edge and cannot be scrolled into view (WCAG 1.4.10, Phase 3 probe 2026-10-16)";

/** Step 0 axe nodes on /t/<team>/documents. Ids are referenced in docs/observations/documenso-signing-known-issues.md. */
export const DOCUMENSO_AXE_ALLOWLIST: readonly AxeAllowlistEntry[] = [
  {
    rule: "color-contrast",
    // No data-testid/role on the avatar span; source Tailwind classes. Step 0 recorded yellow initials
    // (bg-yellow-200); the 2026-10-16 build run shows blue ones (bg-water), re-measured 4.39:1 in both themes.
    target: ".bg-water.text-water-700",
    finding: "PRODUCT BUG DOC-VIS-004-F1: pending-recipient initials #4764ae on #d7e4f3 4.39:1",
  },
  {
    rule: "color-contrast",
    // Plain text div ("Organize your documents"); no testid/role exists. Source Tailwind class, not a hash.
    target: ".text-muted-foreground\\/60",
    finding: "PRODUCT BUG DOC-VIS-004-F2: 'Organize your documents' #a2acb9 on #fff 2.29:1",
    contexts: ["light", "wcag"],
  },
  {
    rule: "color-contrast",
    // "Ctrl+K" hint div; no testid/role exists. Source Tailwind classes, not a hash.
    target: ".bg-muted.px-1\\.5",
    finding: "PRODUCT BUG DOC-VIS-004-F3: 'Ctrl+K' hint #64748b on #f1f5f9 4.34:1",
    contexts: ["light", "wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
  // X07 (accepted):
  {
    rule: "button-name",
    target: '[data-testid="document-table-action-btn"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F4: row action menu button has no accessible name",
    contexts: ["wcag"],
  },
  {
    rule: "button-name",
    // Two unnamed icon buttons in the mobile header: no testid, no role beyond <button>. Structural selector from source.
    target: ".space-x-4 > button",
    finding: "PRODUCT BUG DOC-VIS-X07-F5: mobile header icon buttons have no accessible name",
    contexts: ["wcag"],
    viewports: ["visual-mobile"],
  },
  {
    rule: "button-name",
    target: 'button[role="combobox"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F6: period filter combobox has no accessible name",
    contexts: ["wcag"],
  },
  {
    rule: "label",
    // One node has data-testid="document-upload-input", the other none: the stable type attribute covers both.
    target: 'input[type="file"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F7: hidden upload inputs have no label",
    contexts: ["wcag"],
  },
  {
    rule: "link-name",
    // Header logo link: no testid/role/aria; source Tailwind responsive class.
    target: "a.md\\:inline",
    finding: "PRODUCT BUG DOC-VIS-X07-F8: header link has no accessible name",
    contexts: ["wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
  {
    rule: "nested-interactive",
    target: 'button[role="presentation"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F9: upload button nested interactive",
    contexts: ["wcag"],
  },
  {
    rule: "link-name",
    // Not in Step 0: the header inbox icon link (href /inbox) is a second unnamed link beside F8's team link.
    // Stable href attribute; hidden at mobile width.
    target: 'a[href$="inbox"]',
    finding: "PRODUCT BUG DOC-VIS-X07-F10: header inbox link has no accessible name",
    contexts: ["wcag"],
    viewports: ["visual-tablet", "visual-desktop"],
  },
];

/** VIS-004 scans the two themes with only the contrast entries F1-F3. */
export const DOC_VIS004_ALLOWLIST: readonly AxeAllowlistEntry[] = DOCUMENSO_AXE_ALLOWLIST.filter(
  (e) => e.finding.startsWith("PRODUCT BUG DOC-VIS-004-"),
);
