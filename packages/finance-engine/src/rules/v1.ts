import type { AllocationRuleSet } from "../types.ts";

/**
 * Product-policy templates, not personalized recommendations.
 * The UI must present all templates equally and require an explicit user choice.
 */
export const ALLOCATION_RULES_V1 = {
  version: "budget-allocation-v1.0.0",
  allocationUnitWon: 1_000,
  maxMoneyWon: 1_000_000_000_000,
  maxEmergencyTargetMonths: 12,
  maxGoals: 50,
  scenarios: [
    {
      id: "SAFE",
      weights: {
        emergencyReserveBps: 6_000,
        userGoalsBps: 2_500,
        longTermGoalBps: 500,
        unassignedBps: 1_000,
      },
    },
    {
      id: "BALANCED",
      weights: {
        emergencyReserveBps: 4_000,
        userGoalsBps: 3_000,
        longTermGoalBps: 2_000,
        unassignedBps: 1_000,
      },
    },
    {
      id: "GROWTH",
      weights: {
        emergencyReserveBps: 2_500,
        userGoalsBps: 2_500,
        longTermGoalBps: 4_000,
        unassignedBps: 1_000,
      },
    },
  ],
} as const satisfies AllocationRuleSet;

