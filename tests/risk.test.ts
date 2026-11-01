import { describe, it, expect, beforeEach } from "vitest";
import { resetDB, db } from "@/lib/store";
import { advanceClock, HOUR } from "@/lib/clock";
import { riskFor, simulateLimitation, explainLimitation, renotifyUnread, earlyWarning } from "@/lib/risk";

describe("Freeze alerts + Hold Explainer", () => {
  beforeEach(() => resetDB());

  it("spots Meera's launch-week spike, new countries, dispute and F&F sales", () => {
    const ids = riskFor("meera").signals.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["volume_spike", "new_countries", "dispute_rate", "ff_for_goods"]));
    expect(riskFor("meera").level).toBe("high");
  });
  it("keeps Ravi's quiet account low risk", () => {
    expect(riskFor("ravi").level).toBe("low");
  });
  it("sends an early warning at most once a day", async () => {
    expect(await earlyWarning("meera")).toBe(true);
    expect(await earlyWarning("meera")).toBe(false);
    advanceClock(25 * HOUR);
    expect(await earlyWarning("meera")).toBe(true);
  });
  it("explains a limitation with evidence, documents and an appeal", async () => {
    const e = await simulateLimitation("meera");
    expect(e.limited).toBe(true);
    expect(e.related.length).toBeGreaterThan(0);
    expect(e.reason.docs.length).toBeGreaterThan(0);
    expect(e.appeal).toContain("Meera Nair");
    expect(db().outbox[0].subject).toMatch(/limited/);
  });
  it("re-notifies unread freeze alerts at 24h and 72h, then stops", async () => {
    await simulateLimitation("meera");
    advanceClock(23 * HOUR);
    expect(await renotifyUnread()).toBe(0);
    advanceClock(2 * HOUR);
    expect(await renotifyUnread()).toBe(1);
    advanceClock(48 * HOUR);
    expect(await renotifyUnread()).toBe(1);
    advanceClock(96 * HOUR);
    expect(await renotifyUnread()).toBe(0);
  });
  it("lets the user pass a specific reason", async () => {
    const e = await simulateLimitation("meera", "ff_for_goods");
    expect((await explainLimitation("meera")).code).toBe("ff_for_goods");
    expect(e.reason.title).toMatch(/Friends & Family/);
  });
});
