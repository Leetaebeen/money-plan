import { ALLOCATION_RULES_V1 } from "./rules/v1.ts";
import type {
  AllocationInput,
  AllocationResult,
  AllocationRuleSet,
  BucketAllocation,
  BudgetProfileInput,
  DerivedMetrics,
  Explanation,
  GoalAllocation,
  GoalInput,
  GoalMetric,
  PreAllocation,
  ScenarioPlan,
  ScenarioTemplate,
  ValidationIssue,
  Won,
} from "./types.ts";

const DISCLOSURES = [
  "EDUCATIONAL_BUDGET_SCENARIO_NOT_A_FINANCIAL_PRODUCT_RECOMMENDATION",
  "NO_SCENARIO_IS_SELECTED_AUTOMATICALLY",
  "NO_PRODUCT_TICKER_TRADE_TIMING_OR_EXPECTED_RETURN_IS_PRODUCED",
] as const;

function isMoney(value: unknown, maxMoneyWon: Won): value is Won {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= maxMoneyWon
  );
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateMoney(
  issues: ValidationIssue[],
  path: string,
  value: unknown,
  rules: AllocationRuleSet,
): void {
  if (!isMoney(value, rules.maxMoneyWon)) {
    issues.push({ code: "INVALID_MONEY", path });
  }
}

function validateGoal(
  goal: GoalInput,
  index: number,
  issues: ValidationIssue[],
  rules: AllocationRuleSet,
): void {
  const base = `profile.goals[${index}]`;
  if (typeof goal.id !== "string" || goal.id.trim().length === 0) {
    issues.push({ code: "GOAL_ID_REQUIRED", path: `${base}.id` });
  }
  if (typeof goal.label !== "string" || goal.label.trim().length === 0) {
    issues.push({ code: "GOAL_LABEL_REQUIRED", path: `${base}.label` });
  }
  if (!["SHORT_TERM", "DEBT_REPAYMENT", "OTHER"].includes(goal.kind)) {
    issues.push({ code: "INVALID_GOAL_KIND", path: `${base}.kind` });
  }
  validateMoney(issues, `${base}.targetWon`, goal.targetWon, rules);
  validateMoney(issues, `${base}.savedWon`, goal.savedWon, rules);
  if (!Number.isInteger(goal.monthsRemaining) || goal.monthsRemaining < 1 || goal.monthsRemaining > 600) {
    issues.push({ code: "INVALID_GOAL_MONTHS", path: `${base}.monthsRemaining` });
  }
  if (!Number.isInteger(goal.userPriority) || goal.userPriority < 1) {
    issues.push({ code: "INVALID_USER_PRIORITY", path: `${base}.userPriority` });
  }
  if (goal.windfallCatchUpWon !== undefined) {
    validateMoney(issues, `${base}.windfallCatchUpWon`, goal.windfallCatchUpWon, rules);
  }
}

function validateProfile(
  profile: BudgetProfileInput,
  issues: ValidationIssue[],
  rules: AllocationRuleSet,
): void {
  validateMoney(issues, "profile.monthlyNetIncomeWon", profile.monthlyNetIncomeWon, rules);
  if (profile.monthlyNetIncomeWon === 0) {
    issues.push({ code: "MONTHLY_INCOME_REQUIRED", path: "profile.monthlyNetIncomeWon" });
  }
  validateMoney(issues, "profile.fixedEssentialWon", profile.fixedEssentialWon, rules);
  if (profile.variableEssentialWon === null) {
    issues.push({ code: "VARIABLE_ESSENTIAL_REQUIRED", path: "profile.variableEssentialWon" });
  } else {
    validateMoney(issues, "profile.variableEssentialWon", profile.variableEssentialWon, rules);
  }
  validateMoney(
    issues,
    "profile.irregularEssentialReserveWon",
    profile.irregularEssentialReserveWon,
    rules,
  );
  validateMoney(
    issues,
    "profile.contractualDebtPaymentsWon",
    profile.contractualDebtPaymentsWon,
    rules,
  );
  validateMoney(issues, "profile.plannedFlexibleSpendWon", profile.plannedFlexibleSpendWon, rules);
  validateMoney(issues, "profile.currentEmergencyFundWon", profile.currentEmergencyFundWon, rules);

  if (
    !Number.isInteger(profile.emergencyTargetMonths) ||
    profile.emergencyTargetMonths < 0 ||
    profile.emergencyTargetMonths > rules.maxEmergencyTargetMonths
  ) {
    issues.push({ code: "INVALID_EMERGENCY_TARGET_MONTHS", path: "profile.emergencyTargetMonths" });
  }

  if (typeof profile.longTermGoalEnabled !== "boolean") {
    issues.push({ code: "INVALID_LONG_TERM_CHOICE", path: "profile.longTermGoalEnabled" });
  }

  if (!Array.isArray(profile.goals) || profile.goals.length > rules.maxGoals) {
    issues.push({ code: "INVALID_GOAL_COUNT", path: "profile.goals" });
    return;
  }

  profile.goals.forEach((goal, index) => validateGoal(goal, index, issues, rules));
  const ids = profile.goals.map((goal) => goal.id);
  if (new Set(ids).size !== ids.length) {
    issues.push({ code: "DUPLICATE_GOAL_ID", path: "profile.goals" });
  }
}

function validateInput(input: AllocationInput, rules: AllocationRuleSet): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isValidDateOnly(input.asOf)) {
    issues.push({ code: "INVALID_AS_OF_DATE", path: "asOf" });
  }
  validateProfile(input.profile, issues, rules);

  if (input.mode === "MONTHLY_SALARY") {
    validateMoney(
      issues,
      "currentCycleRequiredShortfallWon",
      input.currentCycleRequiredShortfallWon,
      rules,
    );
  } else if (input.mode === "WINDFALL") {
    validateMoney(issues, "amountWon", input.amountWon, rules);
    validateMoney(issues, "taxReserveWon", input.taxReserveWon, rules);
    validateMoney(issues, "nearTermReserveWon", input.nearTermReserveWon, rules);
    if (
      !Number.isInteger(input.deficitCoverageMonths) ||
      input.deficitCoverageMonths < 0 ||
      input.deficitCoverageMonths > 12
    ) {
      issues.push({ code: "INVALID_DEFICIT_COVERAGE_MONTHS", path: "deficitCoverageMonths" });
    }
    if (
      isMoney(input.amountWon, rules.maxMoneyWon) &&
      isMoney(input.taxReserveWon, rules.maxMoneyWon) &&
      isMoney(input.nearTermReserveWon, rules.maxMoneyWon) &&
      input.taxReserveWon + input.nearTermReserveWon > input.amountWon
    ) {
      issues.push({ code: "WINDFALL_RESERVES_EXCEED_AMOUNT", path: "amountWon" });
    }
  } else {
    issues.push({ code: "INVALID_PLAN_MODE", path: "mode" });
  }

  return issues;
}

function ceilDivision(numerator: number, denominator: number): number {
  return Math.ceil(numerator / denominator);
}

function deriveGoalMetrics(goals: readonly GoalInput[]): GoalMetric[] {
  return [...goals]
    .sort((a, b) => a.userPriority - b.userPriority || a.id.localeCompare(b.id))
    .map((goal) => {
      const gapWon = Math.max(0, goal.targetWon - goal.savedWon);
      return {
        id: goal.id,
        kind: goal.kind,
        gapWon,
        monthlyNeedWon: gapWon === 0 ? 0 : ceilDivision(gapWon, goal.monthsRemaining),
        windfallCatchUpWon: Math.min(gapWon, goal.windfallCatchUpWon ?? 0),
        userPriority: goal.userPriority,
      };
    });
}

function deriveBaseMetrics(
  profile: BudgetProfileInput,
): Omit<DerivedMetrics, "deployableWon" | "unmetCurrentCycleRequiredShortfallWon"> {
  const variableEssentialWon = profile.variableEssentialWon ?? 0;
  const coreMonthlyCostWon =
    profile.fixedEssentialWon +
    variableEssentialWon +
    profile.irregularEssentialReserveWon +
    profile.contractualDebtPaymentsWon;
  const hardSurplusWon = profile.monthlyNetIncomeWon - coreMonthlyCostWon;
  const structuralDeficitWon = Math.max(0, -hardSurplusWon);
  const flexibleSpendShortfallWon =
    hardSurplusWon >= 0 ? Math.max(0, profile.plannedFlexibleSpendWon - hardSurplusWon) : 0;
  const emergencyTargetWon = coreMonthlyCostWon * profile.emergencyTargetMonths;
  const emergencyGapWon = Math.max(0, emergencyTargetWon - profile.currentEmergencyFundWon);
  const goals = deriveGoalMetrics(profile.goals);
  const totalMonthlyGoalNeedWon = goals.reduce((sum, goal) => sum + goal.monthlyNeedWon, 0);

  return {
    coreMonthlyCostWon,
    hardSurplusWon,
    structuralDeficitWon,
    flexibleSpendShortfallWon,
    emergencyTargetWon,
    emergencyGapWon,
    totalMonthlyGoalNeedWon,
    goals,
  };
}

function floorToUnit(amountWon: Won, unitWon: Won): Won {
  return Math.floor(amountWon / unitWon) * unitWon;
}

function weightedAmount(totalWon: Won, basisPoints: number, unitWon: Won): Won {
  const rawWon = Number((BigInt(totalWon) * BigInt(basisPoints)) / 10_000n);
  return floorToUnit(rawWon, unitWon);
}

function splitGoalAllocation(
  availableWon: Won,
  goals: readonly GoalMetric[],
  mode: AllocationInput["mode"],
  unitWon: Won,
): { totalWon: Won; details: GoalAllocation[] } {
  let remainingWon = availableWon;
  const details: GoalAllocation[] = [];

  for (const goal of goals) {
    const requestedForGoal = mode === "MONTHLY_SALARY" ? goal.monthlyNeedWon : goal.windfallCatchUpWon;
    const capWon = floorToUnit(Math.min(goal.gapWon, requestedForGoal), unitWon);
    const amountWon = Math.min(remainingWon, capWon);
    if (amountWon > 0) {
      details.push({ goalId: goal.id, amountWon });
      remainingWon -= amountWon;
    }
    if (remainingWon === 0) break;
  }

  return {
    totalWon: availableWon - remainingWon,
    details,
  };
}

function makeScenario(
  input: AllocationInput,
  template: ScenarioTemplate,
  derived: DerivedMetrics,
  rules: AllocationRuleSet,
): ScenarioPlan {
  const explanations: Explanation[] = [
    {
      code: "USER_MUST_SELECT_SCENARIO",
      params: { scenarioId: template.id },
    },
  ];

  const deployableWon = derived.deployableWon;
  let emergencyWon = weightedAmount(
    deployableWon,
    template.weights.emergencyReserveBps,
    rules.allocationUnitWon,
  );
  let userGoalsWon = weightedAmount(
    deployableWon,
    template.weights.userGoalsBps,
    rules.allocationUnitWon,
  );
  let longTermWon = weightedAmount(
    deployableWon,
    template.weights.longTermGoalBps,
    rules.allocationUnitWon,
  );

  let unassignedWon = deployableWon - emergencyWon - userGoalsWon - longTermWon;

  const emergencyCapWon = floorToUnit(derived.emergencyGapWon, rules.allocationUnitWon);
  if (emergencyWon > emergencyCapWon) {
    unassignedWon += emergencyWon - emergencyCapWon;
    emergencyWon = emergencyCapWon;
    explanations.push({ code: "EMERGENCY_TARGET_ALREADY_CAPPED", params: {} });
  }

  const goalSplit = splitGoalAllocation(
    userGoalsWon,
    derived.goals,
    input.mode,
    rules.allocationUnitWon,
  );
  if (goalSplit.totalWon < userGoalsWon) {
    unassignedWon += userGoalsWon - goalSplit.totalWon;
    userGoalsWon = goalSplit.totalWon;
  }

  if (!input.profile.longTermGoalEnabled && longTermWon > 0) {
    unassignedWon += longTermWon;
    longTermWon = 0;
    explanations.push({ code: "LONG_TERM_BUCKET_DISABLED_BY_USER", params: {} });
  }

  if (emergencyWon < Math.min(derived.emergencyGapWon, deployableWon)) {
    explanations.push({
      code: "EMERGENCY_GAP_REMAINS",
      params: { remainingWon: derived.emergencyGapWon - emergencyWon },
    });
  }

  const requestedGoalAmountWon = input.mode === "MONTHLY_SALARY"
    ? derived.totalMonthlyGoalNeedWon
    : derived.goals.reduce((sum, goal) => sum + goal.windfallCatchUpWon, 0);
  if (userGoalsWon < requestedGoalAmountWon) {
    explanations.push({
      code: "USER_GOAL_AMOUNT_SHORTFALL",
      params: { shortfallWon: requestedGoalAmountWon - userGoalsWon },
    });
  }

  if (unassignedWon > weightedAmount(
    deployableWon,
    template.weights.unassignedBps,
    rules.allocationUnitWon,
  )) {
    explanations.push({
      code: "UNASSIGNED_AMOUNT_NEEDS_USER_REVIEW",
      params: { amountWon: unassignedWon },
    });
  }

  const allocations: BucketAllocation[] = [
    { bucket: "EMERGENCY_RESERVE", amountWon: emergencyWon },
    { bucket: "USER_GOALS", amountWon: userGoalsWon },
    { bucket: "LONG_TERM_GOAL", amountWon: longTermWon },
    { bucket: "UNASSIGNED", amountWon: unassignedWon },
  ];

  const total = allocations.reduce((sum, allocation) => sum + allocation.amountWon, 0);
  if (total !== deployableWon) {
    throw new Error(`Allocation invariant failed for ${template.id}: ${total} !== ${deployableWon}`);
  }

  return {
    scenarioId: template.id,
    requiresUserSelection: true,
    weights: { ...template.weights },
    allocations,
    goalAllocations: goalSplit.details,
    explanations,
  };
}

function invalidResult(input: AllocationInput, rules: AllocationRuleSet, issues: ValidationIssue[]): AllocationResult {
  return {
    ruleVersion: rules.version,
    asOf: input.asOf,
    mode: input.mode,
    status: "INVALID",
    issues,
    derived: null,
    preAllocations: [],
    scenarios: [],
    disclosures: DISCLOSURES,
  };
}

export function calculateAllocationPlans(
  input: AllocationInput,
  rules: AllocationRuleSet = ALLOCATION_RULES_V1,
): AllocationResult {
  const issues = validateInput(input, rules);
  if (issues.length > 0) return invalidResult(input, rules, issues);

  const base = deriveBaseMetrics(input.profile);
  const preAllocations: PreAllocation[] = [];
  let deployableWon = 0;
  let unmetCurrentCycleRequiredShortfallWon = 0;

  if (input.mode === "MONTHLY_SALARY") {
    if (base.structuralDeficitWon > 0) {
      return {
        ruleVersion: rules.version,
        asOf: input.asOf,
        mode: input.mode,
        status: "STRUCTURAL_DEFICIT",
        issues: [],
        derived: {
          ...base,
          deployableWon: 0,
          unmetCurrentCycleRequiredShortfallWon: input.currentCycleRequiredShortfallWon,
        },
        preAllocations: [],
        scenarios: [],
        disclosures: DISCLOSURES,
      };
    }

    const afterFlexibleWon = Math.max(0, base.hardSurplusWon - input.profile.plannedFlexibleSpendWon);
    const currentCycleReserveWon = Math.min(afterFlexibleWon, input.currentCycleRequiredShortfallWon);
    if (currentCycleReserveWon > 0) {
      preAllocations.push({ bucket: "CURRENT_CYCLE_RESERVE", amountWon: currentCycleReserveWon });
    }
    unmetCurrentCycleRequiredShortfallWon = Math.max(
      0,
      input.currentCycleRequiredShortfallWon - currentCycleReserveWon,
    );
    deployableWon = afterFlexibleWon - currentCycleReserveWon;
  } else {
    let remainingWon = input.amountWon;
    const taxReserveWon = Math.min(remainingWon, input.taxReserveWon);
    remainingWon -= taxReserveWon;
    if (taxReserveWon > 0) preAllocations.push({ bucket: "TAX_RESERVE", amountWon: taxReserveWon });

    const nearTermReserveWon = Math.min(remainingWon, input.nearTermReserveWon);
    remainingWon -= nearTermReserveWon;
    if (nearTermReserveWon > 0) {
      preAllocations.push({ bucket: "NEAR_TERM_RESERVE", amountWon: nearTermReserveWon });
    }

    if (base.structuralDeficitWon > 0 && input.deficitCoverageMonths === 0) {
      return {
        ruleVersion: rules.version,
        asOf: input.asOf,
        mode: input.mode,
        status: "DEFICIT_REVIEW_REQUIRED",
        issues: [],
        derived: { ...base, deployableWon: 0, unmetCurrentCycleRequiredShortfallWon: 0 },
        preAllocations,
        scenarios: [],
        disclosures: DISCLOSURES,
      };
    }

    const deficitReserveTargetWon = base.structuralDeficitWon * input.deficitCoverageMonths;
    const deficitReserveWon = Math.min(remainingWon, deficitReserveTargetWon);
    remainingWon -= deficitReserveWon;
    if (deficitReserveWon > 0) {
      preAllocations.push({ bucket: "DEFICIT_RESERVE", amountWon: deficitReserveWon });
    }
    deployableWon = remainingWon;
  }

  const derived: DerivedMetrics = {
    ...base,
    deployableWon,
    unmetCurrentCycleRequiredShortfallWon,
  };
  if (deployableWon === 0) {
    return {
      ruleVersion: rules.version,
      asOf: input.asOf,
      mode: input.mode,
      status: "NO_DEPLOYABLE_AMOUNT",
      issues: [],
      derived,
      preAllocations,
      scenarios: [],
      disclosures: DISCLOSURES,
    };
  }

  const scenarios = rules.scenarios.map((template) => makeScenario(input, template, derived, rules));

  return {
    ruleVersion: rules.version,
    asOf: input.asOf,
    mode: input.mode,
    status: "READY",
    issues: [],
    derived,
    preAllocations,
    scenarios,
    disclosures: DISCLOSURES,
  };
}
