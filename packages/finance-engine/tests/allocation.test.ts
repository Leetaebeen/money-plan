import assert from "node:assert/strict";
import test from "node:test";

import { calculateAllocationPlans } from "../src/index.ts";
import type {
  AllocationInput,
  BudgetProfileInput,
  ScenarioPlan,
} from "../src/index.ts";

function baseProfile(overrides: Partial<BudgetProfileInput> = {}): BudgetProfileInput {
  return {
    monthlyNetIncomeWon: 3_000_000,
    fixedEssentialWon: 1_000_000,
    variableEssentialWon: 600_000,
    irregularEssentialReserveWon: 100_000,
    contractualDebtPaymentsWon: 100_000,
    plannedFlexibleSpendWon: 300_000,
    currentEmergencyFundWon: 0,
    emergencyTargetMonths: 4,
    longTermGoalEnabled: true,
    goals: [
      {
        id: "goal-1",
        label: "사용자가 정한 1년 목표",
        kind: "SHORT_TERM",
        targetWon: 12_000_000,
        savedWon: 0,
        monthsRemaining: 12,
        userPriority: 1,
        windfallCatchUpWon: 300_000,
      },
    ],
    ...overrides,
  };
}

function monthlyInput(profileOverrides: Partial<BudgetProfileInput> = {}): AllocationInput {
  return {
    mode: "MONTHLY_SALARY",
    asOf: "2026-08-17",
    profile: baseProfile(profileOverrides),
    currentCycleRequiredShortfallWon: 0,
  };
}

function scenario(result: ReturnType<typeof calculateAllocationPlans>, id: ScenarioPlan["scenarioId"]): ScenarioPlan {
  const found = result.scenarios.find((plan) => plan.scenarioId === id);
  assert.ok(found, `Missing ${id} scenario`);
  return found;
}

function amount(plan: ScenarioPlan, bucket: ScenarioPlan["allocations"][number]["bucket"]): number {
  return plan.allocations.find((allocation) => allocation.bucket === bucket)?.amountWon ?? 0;
}

test("missing variable essential expenses blocks calculation", () => {
  const result = calculateAllocationPlans(monthlyInput({ variableEssentialWon: null }));
  assert.equal(result.status, "INVALID");
  assert.equal(result.scenarios.length, 0);
  assert.ok(result.issues.some((issue) => issue.code === "VARIABLE_ESSENTIAL_REQUIRED"));
});

test("a structural deficit produces no allocation scenario", () => {
  const result = calculateAllocationPlans(
    monthlyInput({
      monthlyNetIncomeWon: 1_500_000,
      fixedEssentialWon: 1_200_000,
      variableEssentialWon: 500_000,
      irregularEssentialReserveWon: 100_000,
      contractualDebtPaymentsWon: 100_000,
      plannedFlexibleSpendWon: 0,
    }),
  );

  assert.equal(result.status, "STRUCTURAL_DEFICIT");
  assert.equal(result.derived?.structuralDeficitWon, 400_000);
  assert.equal(result.scenarios.length, 0);
});

test("all templates are shown without selecting one automatically", () => {
  const result = calculateAllocationPlans(monthlyInput());
  assert.equal(result.status, "READY");
  assert.equal(result.derived?.coreMonthlyCostWon, 1_800_000);
  assert.equal(result.derived?.deployableWon, 900_000);
  assert.deepEqual(result.scenarios.map((plan) => plan.scenarioId), ["SAFE", "BALANCED", "GROWTH"]);
  assert.ok(result.scenarios.every((plan) => plan.requiresUserSelection));

  const safe = scenario(result, "SAFE");
  assert.equal(amount(safe, "EMERGENCY_RESERVE"), 540_000);
  assert.equal(amount(safe, "USER_GOALS"), 225_000);
  assert.equal(amount(safe, "LONG_TERM_GOAL"), 45_000);
  assert.equal(amount(safe, "UNASSIGNED"), 90_000);
});

test("every scenario preserves the exact deployable amount", () => {
  const result = calculateAllocationPlans(monthlyInput());
  for (const plan of result.scenarios) {
    const total = plan.allocations.reduce((sum, allocation) => sum + allocation.amountWon, 0);
    assert.equal(total, result.derived?.deployableWon);
    assert.ok(plan.allocations.every((allocation) => allocation.amountWon >= 0));
  }
});

test("fulfilled emergency and goal caps move unused amounts to unassigned", () => {
  const result = calculateAllocationPlans(
    monthlyInput({
      currentEmergencyFundWon: 20_000_000,
      goals: [],
    }),
  );
  const safe = scenario(result, "SAFE");
  assert.equal(amount(safe, "EMERGENCY_RESERVE"), 0);
  assert.equal(amount(safe, "USER_GOALS"), 0);
  assert.equal(amount(safe, "LONG_TERM_GOAL"), 45_000);
  assert.equal(amount(safe, "UNASSIGNED"), 855_000);
  assert.ok(safe.explanations.some((item) => item.code === "UNASSIGNED_AMOUNT_NEEDS_USER_REVIEW"));
});

test("goal money follows the priority explicitly chosen by the user", () => {
  const result = calculateAllocationPlans(
    monthlyInput({
      goals: [
        {
          id: "second",
          label: "두 번째 목표",
          kind: "OTHER",
          targetWon: 1_200_000,
          savedWon: 0,
          monthsRemaining: 12,
          userPriority: 2,
        },
        {
          id: "first",
          label: "첫 번째 목표",
          kind: "DEBT_REPAYMENT",
          targetWon: 2_400_000,
          savedWon: 0,
          monthsRemaining: 12,
          userPriority: 1,
        },
      ],
    }),
  );
  const safe = scenario(result, "SAFE");
  assert.deepEqual(safe.goalAllocations, [
    { goalId: "first", amountWon: 200_000 },
    { goalId: "second", amountWon: 25_000 },
  ]);
});

test("a 700,000 won windfall reserves user-entered amounts before scenarios", () => {
  const input: AllocationInput = {
    mode: "WINDFALL",
    asOf: "2026-08-17",
    profile: baseProfile({
      currentEmergencyFundWon: 0,
      goals: [],
    }),
    amountWon: 700_000,
    taxReserveWon: 50_000,
    nearTermReserveWon: 100_000,
    deficitCoverageMonths: 0,
  };
  const result = calculateAllocationPlans(input);
  assert.equal(result.status, "READY");
  assert.equal(result.derived?.deployableWon, 550_000);
  assert.deepEqual(result.preAllocations, [
    { bucket: "TAX_RESERVE", amountWon: 50_000 },
    { bucket: "NEAR_TERM_RESERVE", amountWon: 100_000 },
  ]);
  for (const plan of result.scenarios) {
    const total = plan.allocations.reduce((sum, allocation) => sum + allocation.amountWon, 0);
    assert.equal(total + 150_000, 700_000);
  }
});

test("a windfall requires an explicit deficit-runway choice", () => {
  const result = calculateAllocationPlans({
    mode: "WINDFALL",
    asOf: "2026-08-17",
    profile: baseProfile({
      monthlyNetIncomeWon: 1_600_000,
      plannedFlexibleSpendWon: 0,
    }),
    amountWon: 700_000,
    taxReserveWon: 0,
    nearTermReserveWon: 0,
    deficitCoverageMonths: 0,
  });
  assert.equal(result.status, "DEFICIT_REVIEW_REQUIRED");
  assert.equal(result.scenarios.length, 0);
});

test("a user-selected deficit runway is reserved mechanically", () => {
  const result = calculateAllocationPlans({
    mode: "WINDFALL",
    asOf: "2026-08-17",
    profile: baseProfile({
      monthlyNetIncomeWon: 1_600_000,
      plannedFlexibleSpendWon: 0,
      goals: [],
    }),
    amountWon: 700_000,
    taxReserveWon: 0,
    nearTermReserveWon: 0,
    deficitCoverageMonths: 3,
  });
  assert.equal(result.status, "READY");
  assert.deepEqual(result.preAllocations, [
    { bucket: "DEFICIT_RESERVE", amountWon: 600_000 },
  ]);
  assert.equal(result.derived?.deployableWon, 100_000);
});

test("rounding residue remains unassigned and total money is preserved", () => {
  const input = monthlyInput({
    monthlyNetIncomeWon: 2_604_567,
    fixedEssentialWon: 1_000_000,
    variableEssentialWon: 600_000,
    irregularEssentialReserveWon: 100_000,
    contractualDebtPaymentsWon: 100_000,
    plannedFlexibleSpendWon: 100_000,
  });
  const result = calculateAllocationPlans(input);
  assert.equal(result.derived?.deployableWon, 704_567);
  for (const plan of result.scenarios) {
    const total = plan.allocations.reduce((sum, allocation) => sum + allocation.amountWon, 0);
    assert.equal(total, 704_567);
  }
});

test("the same input and rule version are deterministic", () => {
  const input = monthlyInput();
  assert.deepEqual(calculateAllocationPlans(input), calculateAllocationPlans(input));
});

test("output schema never contains product or trading recommendation fields", () => {
  const serialized = JSON.stringify(calculateAllocationPlans(monthlyInput()));
  for (const forbidden of ["productId", "ticker", "tradeAction", "expectedReturn", "buyAt"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("an uncovered current-cycle obligation is never hidden", () => {
  const result = calculateAllocationPlans({
    mode: "MONTHLY_SALARY",
    asOf: "2026-08-17",
    profile: baseProfile({ plannedFlexibleSpendWon: 1_000_000 }),
    currentCycleRequiredShortfallWon: 500_000,
  });
  assert.equal(result.status, "NO_DEPLOYABLE_AMOUNT");
  assert.equal(result.derived?.unmetCurrentCycleRequiredShortfallWon, 300_000);
  assert.deepEqual(result.preAllocations, [
    { bucket: "CURRENT_CYCLE_RESERVE", amountWon: 200_000 },
  ]);
});

test("5,000 deterministic generated inputs preserve allocation invariants", () => {
  let state = 0x6d2b79f5;
  const random = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
  const money = (max: number): number => Math.floor(random() * max);

  for (let index = 0; index < 5_000; index += 1) {
    const income = 1_000_000 + money(9_000_000);
    const input: AllocationInput = {
      mode: "MONTHLY_SALARY",
      asOf: "2026-08-17",
      profile: baseProfile({
        monthlyNetIncomeWon: income,
        fixedEssentialWon: money(income),
        variableEssentialWon: money(2_000_000),
        irregularEssentialReserveWon: money(500_000),
        contractualDebtPaymentsWon: money(500_000),
        plannedFlexibleSpendWon: money(1_000_000),
        currentEmergencyFundWon: money(30_000_000),
        emergencyTargetMonths: Math.floor(random() * 13),
        longTermGoalEnabled: random() >= 0.5,
      }),
      currentCycleRequiredShortfallWon: money(1_000_000),
    };
    const result = calculateAllocationPlans(input);
    if (result.status !== "READY") continue;

    for (const plan of result.scenarios) {
      const total = plan.allocations.reduce((sum, allocation) => sum + allocation.amountWon, 0);
      assert.equal(total, result.derived?.deployableWon);
      assert.ok(plan.allocations.every((allocation) => allocation.amountWon >= 0));
      const goalTotal = plan.goalAllocations.reduce((sum, allocation) => sum + allocation.amountWon, 0);
      assert.equal(goalTotal, amount(plan, "USER_GOALS"));
    }
  }
});
