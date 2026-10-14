import { expect, test } from "../../../src/products/twenty/fixtures/index.js";
import { p1QaCompanyName } from "../../../src/products/twenty/fixtures/names.js";
import { createCompany } from "../../../src/products/twenty/fixtures/records.js";
import { sweepTwentyQaRecords } from "../../../src/products/twenty/fixtures/sweep.js";

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

  test("workers only see their own SameLeaf company", async ({ twentyQa }, testInfo) => {
    const leaf = "SameLeaf";
    const created = await twentyQa.createCompany(leaf);
    expect(created.name).toBe(p1QaCompanyName(twentyQa.prefix, leaf));

    const listed = await twentyQa.api.query<{
      companies?: {
        edges?: Array<{ node?: { id: string; name: string } | null } | null> | null;
      } | null;
    }>(
      "/graphql",
      `query CompaniesByPrefix($filter: CompanyFilterInput!) {
      companies(filter: $filter) { edges { node { id name } } }
    }`,
      {
        filter: { name: { ilike: `${twentyQa.prefix}-SameLeaf` } },
      },
    );

    const nodes =
      listed.companies?.edges
        ?.map((edge) => edge?.node)
        .filter(
          (node): node is { id: string; name: string } => node !== null && node !== undefined,
        ) ?? [];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe(created.id);

    const otherPrefix = twentyQa.prefix.replace(
      new RegExp(`-${String(testInfo.parallelIndex)}$`),
      `-${String(testInfo.parallelIndex === 0 ? 1 : 0)}`,
    );
    const otherListed = await twentyQa.api.query<{
      companies?: { edges?: Array<{ node?: { id: string } | null } | null> | null } | null;
    }>(
      "/graphql",
      `query CompaniesByPrefix($filter: CompanyFilterInput!) {
      companies(filter: $filter) { edges { node { id } } }
    }`,
      {
        filter: { name: { ilike: `${otherPrefix}-SameLeaf` } },
      },
    );
    const otherNodes =
      otherListed.companies?.edges
        ?.map((edge) => edge?.node?.id)
        .filter((id): id is string => typeof id === "string") ?? [];
    expect(otherNodes).toHaveLength(0);
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
