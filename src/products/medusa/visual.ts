/**
 * Strings and constants for the Medusa visual, i18n and network-state specs.
 * German strings come from @medusajs/dashboard 2.21.2 `src/i18n/translations/de.json` (line in each
 * comment), never from the UI under test. English titles come from `en.json`.
 */

export const MED_DE = {
  /** de.json:1300 */
  authorized: "Autorisiert",
  /** de.json:1246 and 1303 */
  pending: "Ausstehend",
  /** de.json:125 */
  cancel: "Abbrechen",
  headings: ["Zusammenfassung", "Zahlungen", "Unerfüllte Artikel", "Kunde", "Aktivität"],
} as const;

export const MED_ERROR = {
  /** en.json:385 */
  notFound: "404 - There is no page at this address",
  /** en.json:387 */
  server: "500 - Internal server error",
  /** en.json:388 */
  serverMessage: "An unexpected error occurred on the server. Please try again later.",
  /** en.json:389 */
  generic: "An error occurred",
  devDetails: "Error Details (Development Mode)",
} as const;

/** The orders list loads one flag per row from a third-party CDN (probe Q-17); it is stubbed, not masked. */
export const MED_FLAG_GLOB = "https://cdn.jsdelivr.net/gh/lipis/flag-icons/**";
export const MED_FLAG_STUB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#cccccc"/></svg>';

/** Admin API paths; `*` does not cross `/`, so `/admin/products/{id}` is not matched. */
export const MED_PRODUCTS_LIST_GLOB = "**/admin/products*";
export const MED_ORDERS_LIST_GLOB = "**/admin/orders*";

/** Visible text of a stack frame in the minified bundle, e.g. "at https://…/index-x.js:1:2". */
export const MED_STACK_FRAME = /\bat .+\.js:\d+:\d+/;
