import assert from "node:assert/strict";
import test from "node:test";
import { calculateAllocationPlans } from "@money-plan/finance-engine";
import {
  buildMonthlyInput,
  buildWindfallInput,
  createEmptyMonthlyDraft,
  createEmptyWindfallDraft,
  normalizeWonInput,
  todayInKorea,
  type MonthlyFormDraft,
} from "../src/domain/plan-form.ts";

function validMonthlyDraft(): MonthlyFormDraft {
  return {
    profile: {
      monthlyNetIncomeWon: "3000000",
      fixedEssentialWon: "1000000",
      variableEssentialWon: "600000",
      irregularEssentialReserveWon: "100000",
      contractualDebtPaymentsWon: "100000",
      plannedFlexibleSpendWon: "300000",
      currentEmergencyFundWon: "0",
      emergencyTargetMonths: 4,
      longTermGoalEnabled: true,
      goals: [
        {
          id: "goal-1",
          label: "이사비",
          kind: "SHORT_TERM",
          targetWon: "12000000",
          savedWon: "0",
          monthsRemaining: "12",
        },
      ],
    },
    currentCycleRequiredShortfallWon: "0",
  };
}

test("an empty variable essential expense is never converted to zero", () => {
  const draft = validMonthlyDraft();
  draft.profile.variableEssentialWon = "";

  const built = buildMonthlyInput(draft, "2026-08-22");

  assert.equal(built.value, null);
  assert.match(built.errors["profile.variableEssentialWon"] ?? "", /입력/);
});

test("emergency months and the long-term choice require explicit input", () => {
  const draft = createEmptyMonthlyDraft();
  const built = buildMonthlyInput(draft, "2026-08-22");

  assert.equal(built.value, null);
  assert.ok(built.errors["profile.emergencyTargetMonths"]);
  assert.ok(built.errors["profile.longTermGoalEnabled"]);
});

test("a valid monthly form produces the expected engine input and result", () => {
  const built = buildMonthlyInput(validMonthlyDraft(), "2026-08-22");
  assert.ok(built.value);
  assert.equal(built.value.profile.variableEssentialWon, 600_000);
  assert.equal(built.value.profile.goals[0]?.userPriority, 1);

  const result = calculateAllocationPlans(built.value);
  assert.equal(result.status, "READY");
  assert.equal(result.derived?.deployableWon, 900_000);
  assert.equal(result.scenarios.length, 3);
});

test("won input normalization removes formatting without creating decimals", () => {
  assert.equal(normalizeWonInput("3,000,000원"), "3000000");
  assert.equal(normalizeWonInput("00070"), "70");
  assert.equal(normalizeWonInput(""), "");
});

test("windfall reserves and goal catch-up remain explicit per calculation", () => {
  const profile = validMonthlyDraft().profile;
  const draft = createEmptyWindfallDraft();
  draft.amountWon = "700000";
  draft.taxReserveWon = "50000";
  draft.nearTermReserveWon = "100000";
  draft.goalCatchUps["goal-1"] = "300000";

  const built = buildWindfallInput(profile, draft, "2026-08-22");

  assert.ok(built.value);
  assert.equal(built.value.deficitCoverageMonths, 0);
  assert.equal(built.value.profile.goals[0]?.windfallCatchUpWon, 300_000);
  assert.equal(profile.goals[0]?.targetWon, "12000000");
});

test("a structural deficit requires a user-selected windfall runway", () => {
  const profile = validMonthlyDraft().profile;
  profile.monthlyNetIncomeWon = "1500000";
  const draft = createEmptyWindfallDraft();
  draft.amountWon = "700000";
  draft.taxReserveWon = "0";
  draft.nearTermReserveWon = "0";

  const blocked = buildWindfallInput(profile, draft, "2026-08-22");
  assert.equal(blocked.value, null);
  assert.ok(blocked.errors.deficitCoverageMonths);

  draft.deficitCoverageMonths = 3;
  const allowed = buildWindfallInput(profile, draft, "2026-08-22");
  assert.equal(allowed.value?.deficitCoverageMonths, 3);
});

test("the calculation date follows Korea local time instead of UTC date", () => {
  assert.equal(todayInKorea(new Date("2026-08-21T15:30:00.000Z")), "2026-08-22");
});
