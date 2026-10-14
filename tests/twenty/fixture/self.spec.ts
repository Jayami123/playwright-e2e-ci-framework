import { expect, test, type TwentyQaFixture } from "../../../src/products/twenty/fixtures/index.js";
import { p1QaCompanyName, p1QaPrefix } from "../../../src/products/twenty/fixtures/names.js";
import { createCompany, destroyCompany } from "../../../src/products/twenty/fixtures/records.js";
import { sweepTwentyQaRecords } from "../../../src/products/twenty/fixtures/sweep.js";

const COMPANIES_BY_PREFIX = `query CompaniesByPrefix($filter: CompanyFilterInput!) {
  companies(filter: $filter) { edges { node { id name } } }
}`;

async function companyIdsForNameFilter(
  api: TwentyQaFixture["api"],
  ilike: string,
): Promise<string[]> {
  const listed = await api.query<{
    companies?: {
      edges?: Array<{ node?: { id: string } | null } | null> | null;
    } | null;
  }>("/graphql", COMPANIES_BY_PREFIX, {
    filter: { name: { ilike } },
  });
  return (
    listed.companies?.edges
      ?.map((edge) => edge?.node?.id)
      .filter((id): id is string => typeof id === "string") ?? []
  );
}

test.describe("Twenty QA fixture TZ restore", { tag: ["@twenty", "@twenty-fixture"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("restores member TZ after inner throw", async ({ twentyQa }, testInfo) => {
    if (testInfo.config.workers > 1 && testInfo.parallelIndex !== 0) {
      test.skip();
      return;
    }
    const original = await twentyQa.readTimeZone();
    await twentyQa.setTimeZone("UTC");
    await expect.poll(async () => twentyQa.readTimeZone()).toBe("UTC");

    await expect(async () => {
      await twentyQa.setTimeZone("UTC");
      throw new Error("inner failure after TZ change");
    }).rejects.toThrow(/inner failure/);

    await twentyQa.restoreTimeZoneIfNeeded();
    expect(await twentyQa.readTimeZone()).toBe(original);
  });
});

test.describe("Twenty QA fixture worker isolation", { tag: ["@twenty", "@twenty-fixture"] }, () => {
  test.describe.configure({ mode: "parallel" });

  test("prefix filters separate own and sibling SameLeaf companies", async ({
    twentyQa,
    factorySeed,
  }, testInfo) => {
    const otherWorkerIndex = testInfo.parallelIndex === 0 ? 1 : 0;
    const baseSeed = factorySeed - testInfo.parallelIndex;
    const otherWorkerRealPrefix = p1QaPrefix(baseSeed + otherWorkerIndex, otherWorkerIndex);
    const leaf = "SameLeaf";
    let siblingId: string | undefined;

    try {
      const own = await twentyQa.createCompany(leaf);
      const sibling = await createCompany(
        twentyQa.api,
        p1QaCompanyName(otherWorkerRealPrefix, leaf),
      );
      siblingId = sibling.id;

      const ownFilter = `${twentyQa.prefix}-${leaf}`;
      const siblingFilter = `${otherWorkerRealPrefix}-${leaf}`;

      expect(await companyIdsForNameFilter(twentyQa.api, ownFilter)).toEqual([own.id]);
      expect(await companyIdsForNameFilter(twentyQa.api, siblingFilter)).toEqual([sibling.id]);

      await destroyCompany(twentyQa.api, own.id);
      twentyQa.forgetCapturedCompany(own.id);
      expect(await companyIdsForNameFilter(twentyQa.api, siblingFilter)).toEqual([sibling.id]);
    } finally {
      if (siblingId !== undefined) {
        await destroyCompany(twentyQa.api, siblingId);
      }
    }
  });
});

test.describe("Twenty QA sweep idempotence", { tag: ["@twenty", "@twenty-fixture"] }, () => {
  test("prefix-scoped sweep is idempotent", async ({ twentyQa }) => {
    const probePrefix = `${twentyQa.prefix}-SweepProbe`;
    await createCompany(twentyQa.api, p1QaCompanyName(probePrefix, "probe"));
    const first = await sweepTwentyQaRecords(probePrefix);
    expect(first.deleted).toBeGreaterThanOrEqual(1);
    expect(first.after).toBe(0);

    const second = await sweepTwentyQaRecords(probePrefix);
    expect(second.before).toBe(0);
    expect(second.deleted).toBe(0);
    expect(second.after).toBe(0);
  });
});
