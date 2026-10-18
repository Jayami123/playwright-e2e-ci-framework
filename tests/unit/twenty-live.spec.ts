import { expect, test } from "@playwright/test";
import {
  latencySummary,
  lostUpdateVerdict,
  parseViewCount,
  raceRoundNames,
} from "../../src/products/twenty/live.js";
import {
  qaMemberCountFilter,
  qaPeerMemberEmail,
} from "../../src/products/twenty/fixtures/qa-member.js";

test.describe("Twenty live helpers", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("parseViewCount reads the count after the dot", () => {
    expect(parseViewCount("All People · 2")).toBe(2);
    expect(parseViewCount("All People\n· 1,226")).toBe(1226);
  });

  test("parseViewCount throws when there is no count", () => {
    expect(() => parseViewCount("All People")).toThrow(/No "· <n>" count/);
  });

  test("latencySummary takes the median of odd and even samples", () => {
    expect(latencySummary([300, 100, 200])).toMatchObject({
      minMs: 100,
      medianMs: 200,
      maxMs: 300,
    });
    expect(latencySummary([400, 100, 200, 300])).toMatchObject({
      minMs: 100,
      medianMs: 250,
      maxMs: 400,
    });
  });

  test("latencySummary throws on no samples", () => {
    expect(() => latencySummary([])).toThrow(/at least one sample/);
  });

  test("raceRoundNames builds the round names", () => {
    expect(raceRoundNames("P1-QA-1-0", "LU001", 3)).toEqual({
      base: "P1-QA-1-0-LU001-r3",
      a: "P1-QA-1-0-LU001-r3-A",
      b: "P1-QA-1-0-LU001-r3-B",
    });
  });

  test("raceRoundNames rejects LIKE wildcards", () => {
    expect(() => raceRoundNames("P1-QA-1%", "LU001", 1)).toThrow(/wildcard/);
    expect(() => raceRoundNames("P1-QA-1-0", "LU_001", 1)).toThrow(/wildcard/);
  });

  test("lostUpdateVerdict names the winner or flags a lost update", () => {
    const names = raceRoundNames("P1-QA-1-0", "LU001", 1);
    expect(lostUpdateVerdict(names.a, names)).toBe("A");
    expect(lostUpdateVerdict(names.b, names)).toBe("B");
    expect(lostUpdateVerdict(names.base, names)).toBe("lost");
  });

  test("qaPeerMemberEmail has the peer shape", () => {
    expect(qaPeerMemberEmail(42, 1)).toBe("p1-qa-42-1-peer@example.test");
  });

  test("the leak filter still matches the peer email", () => {
    const like = qaMemberCountFilter().userEmail.like;
    expect(like).toBe("p1-qa-%");
    expect(qaPeerMemberEmail(42, 1).startsWith(like.slice(0, -1))).toBe(true);
  });
});
