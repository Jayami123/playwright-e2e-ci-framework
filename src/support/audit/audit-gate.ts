/**
 * Decides whether an `npm audit --json` report passes the CI gate.
 *
 * Rules:
 * - Every high or critical advisory must be listed in the allowlist for the same package and GHSA id.
 * - An allowlist entry must still be in date (`expires` on or after today). An expired entry fails the gate
 *   even if the advisory is still reported, so the exception cannot outlive its review date.
 * - An allowlist entry that matches no current advisory fails the gate too: the exception was fixed and should be removed.
 */

export interface AllowlistEntry {
  id: string;
  package: string;
  reason: string;
  /** ISO date (YYYY-MM-DD). The exception is void after this day. */
  expires: string;
}

export interface AuditFinding {
  id: string;
  package: string;
  severity: "high" | "critical";
  title: string;
  url: string;
}

export interface GateResult {
  ok: boolean;
  blocking: AuditFinding[];
  allowed: AuditFinding[];
  expired: AllowlistEntry[];
  stale: AllowlistEntry[];
}

const GHSA_IN_URL = /\/advisories\/(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})/i;
const GATED_SEVERITIES = new Set(["high", "critical"]);

interface NpmAuditVia {
  source?: number | string;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
}

/** Pulls the high and critical advisories out of an `npm audit --json` report (lockfile v2+ format). */
export function findingsFromAuditReport(report: unknown): AuditFinding[] {
  if (typeof report !== "object" || report === null) {
    throw new Error("audit report is not an object");
  }
  const vulnerabilities = (report as { vulnerabilities?: unknown }).vulnerabilities;
  if (typeof vulnerabilities !== "object" || vulnerabilities === null) {
    return [];
  }

  const seen = new Map<string, AuditFinding>();
  for (const [packageKey, rawVuln] of Object.entries(vulnerabilities)) {
    const via = (rawVuln as { via?: unknown }).via;
    if (!Array.isArray(via)) continue;
    for (const entry of via as unknown[]) {
      // Strings in `via` point at other vulnerable packages; the advisory itself is an object.
      if (typeof entry !== "object" || entry === null) continue;
      const advisory = entry as NpmAuditVia;
      const severity = advisory.severity ?? "";
      if (!GATED_SEVERITIES.has(severity)) continue;
      const match = GHSA_IN_URL.exec(advisory.url ?? "");
      const id = match?.[1]?.toUpperCase();
      if (id === undefined) {
        throw new Error(
          `advisory for ${packageKey} has no GHSA id in its url: ${advisory.url ?? "(none)"}`,
        );
      }
      const pkg = advisory.name ?? packageKey;
      const key = `${id}|${pkg}`;
      if (!seen.has(key)) {
        seen.set(key, {
          id,
          package: pkg,
          severity: severity as AuditFinding["severity"],
          title: advisory.title ?? "",
          url: advisory.url ?? "",
        });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Validates the allowlist file shape. Throws with a message naming the bad entry. */
export function parseAllowlist(raw: unknown): AllowlistEntry[] {
  if (!Array.isArray(raw)) throw new Error("audit allowlist must be a JSON array");
  return raw.map((entry, index) => {
    const e = entry as Partial<AllowlistEntry>;
    for (const field of ["id", "package", "reason", "expires"] as const) {
      if (typeof e[field] !== "string" || e[field].trim() === "") {
        throw new Error(`audit allowlist entry ${String(index)} is missing "${field}"`);
      }
    }
    // Shape alone is not enough: 9999-99-99 would otherwise be treated as unexpired. The round trip through
    // Date rejects impossible dates, including ones JavaScript would roll over (2026-02-30).
    const expires = e.expires as string;
    const parsed = new Date(`${expires}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expires) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== expires
    ) {
      throw new Error(
        `audit allowlist entry ${String(index)} has an invalid calendar "expires": ${String(e.expires)}`,
      );
    }
    return {
      id: (e.id as string).toUpperCase(),
      package: e.package as string,
      reason: e.reason as string,
      expires: e.expires as string,
    };
  });
}

/** `today` is an ISO date (YYYY-MM-DD); passed in so the rule is testable without a clock. */
export function evaluateAudit(
  findings: readonly AuditFinding[],
  allowlist: readonly AllowlistEntry[],
  today: string,
): GateResult {
  const blocking: AuditFinding[] = [];
  const allowed: AuditFinding[] = [];

  for (const finding of findings) {
    const entry = allowlist.find((e) => e.id === finding.id && e.package === finding.package);
    if (entry === undefined || entry.expires < today) {
      blocking.push(finding);
    } else {
      allowed.push(finding);
    }
  }

  const expired = allowlist.filter((e) => e.expires < today);
  const stale = allowlist.filter(
    (e) => !findings.some((f) => f.id === e.id && f.package === e.package),
  );

  return {
    ok: blocking.length === 0 && expired.length === 0 && stale.length === 0,
    blocking,
    allowed,
    expired,
    stale,
  };
}
