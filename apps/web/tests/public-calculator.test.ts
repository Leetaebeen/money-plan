import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicCalculatorResult,
  createEmptyPublicCalculatorDraft,
  type PublicCalculatorDraft,
} from "../src/features/public-calculator/public-calculator.ts";

function validDraft(): PublicCalculatorDraft {
  return {
    monthlyNetIncomeWon: "3000000",
    fixedEssentialWon: "1000000",
    variableEssentialWon: "600000",
    irregularEssentialReserveWon: "100000",
    contractualDebtPaymentsWon: "100000",
    plannedFlexibleSpendWon: "300000",
    currentEmergencyFundWon: "0",
    emergencyTargetMonths: 4,
    longTermGoalEnabled: true,
  };
}

test("public calculator uses the allocation engine without adding personal goals", () => {
  const built = buildPublicCalculatorResult(validDraft(), "2026-08-30");

  assert.deepEqual(built.errors, {});
  assert.equal(built.input?.profile.goals.length, 0);
  assert.equal(built.result?.status, "READY");
  assert.equal(built.result?.derived?.coreMonthlyCostWon, 1_800_000);
  assert.equal(built.result?.derived?.deployableWon, 900_000);
  assert.equal(built.result?.scenarios.length, 3);
});

test("blank optional public calculator amounts become explicit zeroes", () => {
  const draft = validDraft();
  draft.irregularEssentialReserveWon = "";
  draft.contractualDebtPaymentsWon = "";
  draft.plannedFlexibleSpendWon = "";
  draft.currentEmergencyFundWon = "";

  const built = buildPublicCalculatorResult(draft, "2026-08-30");

  assert.equal(built.input?.profile.irregularEssentialReserveWon, 0);
  assert.equal(built.input?.profile.contractualDebtPaymentsWon, 0);
  assert.equal(built.input?.profile.plannedFlexibleSpendWon, 0);
  assert.equal(built.input?.profile.currentEmergencyFundWon, 0);
  assert.equal(built.result?.derived?.deployableWon, 1_400_000);
});

test("public calculator blocks missing essential spending and explicit choices", () => {
  const draft = createEmptyPublicCalculatorDraft();
  draft.monthlyNetIncomeWon = "3000000";
  draft.fixedEssentialWon = "1000000";

  const built = buildPublicCalculatorResult(draft, "2026-08-30");

  assert.equal(built.result, null);
  assert.ok(built.errors["profile.variableEssentialWon"]);
  assert.ok(built.errors["profile.emergencyTargetMonths"]);
  assert.ok(built.errors["profile.longTermGoalEnabled"]);
});

test("public calculator does not create allocation scenarios for a structural deficit", () => {
  const draft = validDraft();
  draft.monthlyNetIncomeWon = "1500000";

  const built = buildPublicCalculatorResult(draft, "2026-08-30");

  assert.equal(built.result?.status, "STRUCTURAL_DEFICIT");
  assert.equal(built.result?.scenarios.length, 0);
  assert.equal(built.result?.derived?.structuralDeficitWon, 300_000);
});
