export interface SecretHit {
  readonly file: string;
  readonly pattern: string;
  readonly count: number;
}

/** From the P0b scan of a CI trace: these must never appear in a published report. */
export const SECRET_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "set-cookie header", re: /set-cookie/gi },
  // Any case (HTTP/2 sends cookie:). Not an identifier such as hasSessionCookie: in copied test
  // source, and not Set-Cookie:, which the set-cookie pattern already reports.
  { name: "cookie header", re: /"cookie"\s*:|(?<![\w-])cookie:/gi },
  { name: "documenso session", re: /sessionId=/g },
  { name: "csrf token", re: /csrfToken=/g },
  { name: "twenty session", re: /twenty-session/g },
  { name: "twenty token pair", re: /tokenPair/g },
  { name: "bearer token", re: /Bearer [A-Za-z0-9._-]{8,}/g },
  { name: "refresh token", re: /refreshToken/g },
  { name: "json password field", re: /"password"\s*:\s*"[^"]+"/g },
  { name: "db url with credentials", re: /postgres(?:ql)?:\/\/[^:/@"\s]+:[^@"\s]+@[^/"\s]+/g },
];

/** Public CI defaults committed in e2e.yml; allowed verbatim. */
export const ALLOWED_DB_URLS: readonly string[] = [
  "postgres://documenso:password@127.0.0.1:5451",
  "postgres://postgres:postgres@127.0.0.1:5434",
  "postgresql://postgres:@127.0.0.1:5450",
];

/** Pure. Reports pattern names and counts only, never the matched value. */
export function findSecretHits(file: string, text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const { name, re } of SECRET_PATTERNS) {
    const matches = [...text.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0]);
    const relevant =
      name === "db url with credentials"
        ? matches.filter((m) => !ALLOWED_DB_URLS.includes(m))
        : matches;
    if (relevant.length > 0) hits.push({ file, pattern: name, count: relevant.length });
  }
  return hits;
}
