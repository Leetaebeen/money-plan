import {
  calculateAllocationPlans,
  type AllocationResult,
  type MonthlyPlanInput,
} from "@money-plan/finance-engine";
import {
  buildMonthlyInput,
  todayInKorea,
  type FormErrors,
  type MonthlyFormDraft,
} from "../../domain/plan-form.ts";

export interface PublicCalculatorDraft {
  monthlyNetIncomeWon: string;
  fixedEssentialWon: string;
  variableEssentialWon: string;
  irregularEssentialReserveWon: string;
  contractualDebtPaymentsWon: string;
  plannedFlexibleSpendWon: string;
  currentEmergencyFundWon: string;
  emergencyTargetMonths: number | null;
  longTermGoalEnabled: boolean | null;
}

export interface PublicCalculatorBuildResult {
  input: MonthlyPlanInput | null;
  result: AllocationResult | null;
  errors: FormErrors;
}

export function createEmptyPublicCalculatorDraft(): PublicCalculatorDraft {
  return {
    monthlyNetIncomeWon: "",
    fixedEssentialWon: "",
    variableEssentialWon: "",
    irregularEssentialReserveWon: "",
    contractualDebtPaymentsWon: "",
    plannedFlexibleSpendWon: "",
    currentEmergencyFundWon: "",
    emergencyTargetMonths: null,
    longTermGoalEnabled: null,
  };
}

function optionalMoney(value: string): string {
  return value === "" ? "0" : value;
}

export function buildPublicCalculatorResult(
  draft: PublicCalculatorDraft,
  asOf = todayInKorea(),
): PublicCalculatorBuildResult {
  const monthlyDraft: MonthlyFormDraft = {
    profile: {
      monthlyNetIncomeWon: draft.monthlyNetIncomeWon,
      fixedEssentialWon: draft.fixedEssentialWon,
      variableEssentialWon: draft.variableEssentialWon,
      irregularEssentialReserveWon: optionalMoney(draft.irregularEssentialReserveWon),
      contractualDebtPaymentsWon: optionalMoney(draft.contractualDebtPaymentsWon),
      plannedFlexibleSpendWon: optionalMoney(draft.plannedFlexibleSpendWon),
      currentEmergencyFundWon: optionalMoney(draft.currentEmergencyFundWon),
      emergencyTargetMonths: draft.emergencyTargetMonths,
      longTermGoalEnabled: draft.longTermGoalEnabled,
      goals: [],
    },
    currentCycleRequiredShortfallWon: "0",
  };
  const built = buildMonthlyInput(monthlyDraft, asOf);

  if (!built.value) {
    return { input: null, result: null, errors: built.errors };
  }

  return {
    input: built.value,
    result: calculateAllocationPlans(built.value),
    errors: built.errors,
  };
}
