export type Won = number;

export type PlanMode = "MONTHLY_SALARY" | "WINDFALL";

export type ScenarioId = "SAFE" | "BALANCED" | "GROWTH";

export type GoalKind = "SHORT_TERM" | "DEBT_REPAYMENT" | "OTHER";

export type AllocationBucket =
  | "EMERGENCY_RESERVE"
  | "USER_GOALS"
  | "LONG_TERM_GOAL"
  | "UNASSIGNED";

export type PreAllocationBucket =
  | "CURRENT_CYCLE_RESERVE"
  | "TAX_RESERVE"
  | "NEAR_TERM_RESERVE"
  | "DEFICIT_RESERVE";

export type PlanStatus =
  | "INVALID"
  | "STRUCTURAL_DEFICIT"
  | "DEFICIT_REVIEW_REQUIRED"
  | "NO_DEPLOYABLE_AMOUNT"
  | "READY";

export interface GoalInput {
  id: string;
  label: string;
  kind: GoalKind;
  targetWon: Won;
  savedWon: Won;
  monthsRemaining: number;
  /** Smaller numbers run first. The user, not the engine, chooses this order. */
  userPriority: number;
  /** Optional amount explicitly chosen by the user for a windfall catch-up. */
  windfallCatchUpWon?: Won;
}

export interface BudgetProfileInput {
  monthlyNetIncomeWon: Won;
  fixedEssentialWon: Won;
  /** Missing essential-variable spending blocks calculation instead of becoming zero. */
  variableEssentialWon: Won | null;
  irregularEssentialReserveWon: Won;
  contractualDebtPaymentsWon: Won;
  plannedFlexibleSpendWon: Won;
  currentEmergencyFundWon: Won;
  /** Explicitly selected by the user. The engine never infers this from age or income. */
  emergencyTargetMonths: number;
  /** The user explicitly decides whether a long-term bucket should be shown. */
  longTermGoalEnabled: boolean;
  goals: GoalInput[];
}

export interface MonthlyPlanInput {
  mode: "MONTHLY_SALARY";
  asOf: string;
  profile: BudgetProfileInput;
  /** Confirmed one-off obligations not already included in monthly expenses. */
  currentCycleRequiredShortfallWon: Won;
}

export interface WindfallPlanInput {
  mode: "WINDFALL";
  asOf: string;
  profile: BudgetProfileInput;
  amountWon: Won;
  /** Explicit user input. The engine does not guess a tax rate. */
  taxReserveWon: Won;
  /** Money the user says will be needed soon. */
  nearTermReserveWon: Won;
  /** User-selected runway if the monthly budget has a structural deficit. */
  deficitCoverageMonths: number;
}

export type AllocationInput = MonthlyPlanInput | WindfallPlanInput;

export interface ScenarioWeights {
  emergencyReserveBps: number;
  userGoalsBps: number;
  longTermGoalBps: number;
  unassignedBps: number;
}

export interface ScenarioTemplate {
  id: ScenarioId;
  weights: ScenarioWeights;
}

export interface AllocationRuleSet {
  version: string;
  allocationUnitWon: Won;
  maxMoneyWon: Won;
  maxEmergencyTargetMonths: number;
  maxGoals: number;
  scenarios: readonly ScenarioTemplate[];
}

export interface Explanation {
  code: string;
  params: Readonly<Record<string, string | number | boolean>>;
}

export interface ValidationIssue {
  code: string;
  path: string;
}

export interface GoalMetric {
  id: string;
  kind: GoalKind;
  gapWon: Won;
  monthlyNeedWon: Won;
  windfallCatchUpWon: Won;
  userPriority: number;
}

export interface DerivedMetrics {
  coreMonthlyCostWon: Won;
  hardSurplusWon: number;
  structuralDeficitWon: Won;
  flexibleSpendShortfallWon: Won;
  emergencyTargetWon: Won;
  emergencyGapWon: Won;
  totalMonthlyGoalNeedWon: Won;
  unmetCurrentCycleRequiredShortfallWon: Won;
  deployableWon: Won;
  goals: readonly GoalMetric[];
}

export interface BucketAllocation {
  bucket: AllocationBucket;
  amountWon: Won;
}

export interface GoalAllocation {
  goalId: string;
  amountWon: Won;
}

export interface ScenarioPlan {
  scenarioId: ScenarioId;
  /** A scenario is never selected automatically. */
  requiresUserSelection: true;
  weights: Readonly<ScenarioWeights>;
  allocations: readonly BucketAllocation[];
  goalAllocations: readonly GoalAllocation[];
  explanations: readonly Explanation[];
}

export interface PreAllocation {
  bucket: PreAllocationBucket;
  amountWon: Won;
}

export interface AllocationResult {
  ruleVersion: string;
  asOf: string;
  mode: PlanMode;
  status: PlanStatus;
  issues: readonly ValidationIssue[];
  derived: DerivedMetrics | null;
  preAllocations: readonly PreAllocation[];
  scenarios: readonly ScenarioPlan[];
  disclosures: readonly string[];
}
