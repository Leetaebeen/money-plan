import assert from "node:assert/strict";
import test from "node:test";
import { calculateAllocationPlans } from "@money-plan/finance-engine";
import { buildMonthlyHistory } from "../src/features/history/monthly-history.ts";
import type { StoredPlanRun } from "../src/persistence/db.ts";

function monthlyRun(id: string, createdAt: string, income: number, fixed: number): StoredPlanRun {
  const input = {
    mode: "MONTHLY_SALARY" as const,
    asOf: createdAt.slice(0, 10),
    profile: {
      monthlyNetIncomeWon: income,
      fixedEssentialWon: fixed,
      variableEssentialWon: 500_000,
      irregularEssentialReserveWon: 100_000,
      contractualDebtPaymentsWon: 100_000,
      plannedFlexibleSpendWon: 300_000,
      currentEmergencyFundWon: 0,
      emergencyTargetMonths: 4,
      longTermGoalEnabled: true,
      goals: [],
    },
    currentCycleRequiredShortfallWon: 0,
  };
  const result = calculateAllocationPlans(input);
  assert.equal(result.status, "READY");
  return { id, mode: input.mode, input, result, selectedScenarioId: result.scenarios[0]!.scenarioId, createdAt };
}

test("monthly history keeps the latest save per Korea month and calculates deltas", () => {
  const januaryOld = monthlyRun("jan-old", "2026-01-02T00:00:00.000Z", 3_000_000, 1_000_000);
  const januaryLatest = monthlyRun("jan-latest", "2026-01-31T14:30:00.000Z", 3_100_000, 1_100_000);
  const february = monthlyRun("feb", "2026-02-28T14:30:00.000Z", 3_300_000, 1_100_000);

  const entries = buildMonthlyHistory([february, januaryOld, januaryLatest]);

  assert.deepEqual(entries.map((entry) => entry.id), ["feb", "jan-latest"]);
  assert.deepEqual(entries.map((entry) => entry.monthKey), ["2026-02", "2026-01"]);
  assert.equal(entries[0]!.monthlyNetIncomeDeltaWon, 200_000);
  assert.equal(entries[0]!.coreMonthlyCostDeltaWon, 0);
  assert.equal(entries[0]!.deployableDeltaWon, 200_000);
  assert.equal(entries[1]!.monthlyNetIncomeDeltaWon, null);
});

test("monthly history excludes non-monthly and incomplete results", () => {
  const monthly = monthlyRun("monthly", "2026-03-01T00:00:00.000Z", 3_000_000, 1_000_000);
  const windfall = structuredClone(monthly);
  windfall.id = "windfall";
  windfall.mode = "WINDFALL";
  const incomplete = structuredClone(monthly);
  incomplete.id = "incomplete";
  incomplete.result.derived = null;

  assert.deepEqual(buildMonthlyHistory([windfall, incomplete, monthly]).map((entry) => entry.id), ["monthly"]);
  assert.throws(() => buildMonthlyHistory([monthly], 0), RangeError);
});
