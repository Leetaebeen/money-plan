import type {
  BudgetProfileInput,
  GoalInput,
  GoalKind,
  MonthlyPlanInput,
  WindfallPlanInput,
} from "@money-plan/finance-engine";

const MAX_MONEY_WON = 1_000_000_000_000;

export interface GoalDraft {
  id: string;
  label: string;
  kind: GoalKind;
  targetWon: string;
  savedWon: string;
  monthsRemaining: string;
}

export interface ProfileDraft {
  monthlyNetIncomeWon: string;
  fixedEssentialWon: string;
  variableEssentialWon: string;
  irregularEssentialReserveWon: string;
  contractualDebtPaymentsWon: string;
  plannedFlexibleSpendWon: string;
  currentEmergencyFundWon: string;
  emergencyTargetMonths: number | null;
  longTermGoalEnabled: boolean | null;
  goals: GoalDraft[];
}

export interface MonthlyFormDraft {
  profile: ProfileDraft;
  currentCycleRequiredShortfallWon: string;
}

export interface WindfallFormDraft {
  amountWon: string;
  taxReserveWon: string;
  nearTermReserveWon: string;
  deficitCoverageMonths: number | null;
  goalCatchUps: Record<string, string>;
}

export type FormErrors = Record<string, string>;

export interface FormBuildResult<T> {
  value: T | null;
  errors: FormErrors;
}

export function createEmptyProfileDraft(): ProfileDraft {
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
    goals: [],
  };
}

export function createEmptyMonthlyDraft(profile = createEmptyProfileDraft()): MonthlyFormDraft {
  return {
    profile: structuredClone(profile),
    currentCycleRequiredShortfallWon: "",
  };
}

export function createEmptyWindfallDraft(): WindfallFormDraft {
  return {
    amountWon: "",
    taxReserveWon: "",
    nearTermReserveWon: "",
    deficitCoverageMonths: null,
    goalCatchUps: {},
  };
}

export function normalizeWonInput(value: string): string {
  const digits = value.replace(/[^0-9]/gu, "");
  if (digits.length === 0) return "";
  return digits.replace(/^0+(?=\d)/u, "").slice(0, 13);
}

export function formatWonInput(value: string): string {
  if (value === "") return "";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed.toLocaleString("ko-KR") : value;
}

export function formatWon(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function todayInKorea(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseRequiredMoney(
  raw: string,
  path: string,
  label: string,
  errors: FormErrors,
): number | null {
  if (raw.trim() === "") {
    errors[path] = `${label}을 입력해 주세요. 없으면 0원을 입력하세요.`;
    return null;
  }

  if (!/^\d+$/u.test(raw)) {
    errors[path] = `${label}은 원 단위 숫자로 입력해 주세요.`;
    return null;
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY_WON) {
    errors[path] = `${label}은 0원 이상 1조 원 이하로 입력해 주세요.`;
    return null;
  }

  return value;
}

function parseOptionalMoney(
  raw: string | undefined,
  path: string,
  label: string,
  errors: FormErrors,
): number | null {
  if (raw === undefined || raw.trim() === "") return 0;
  return parseRequiredMoney(raw, path, label, errors);
}

function buildProfile(draft: ProfileDraft, errors: FormErrors): BudgetProfileInput | null {
  const monthlyNetIncomeWon = parseRequiredMoney(
    draft.monthlyNetIncomeWon,
    "profile.monthlyNetIncomeWon",
    "세후 월급",
    errors,
  );
  const fixedEssentialWon = parseRequiredMoney(
    draft.fixedEssentialWon,
    "profile.fixedEssentialWon",
    "고정 필수지출",
    errors,
  );
  const variableEssentialWon = parseRequiredMoney(
    draft.variableEssentialWon,
    "profile.variableEssentialWon",
    "변동 필수생활비",
    errors,
  );
  const irregularEssentialReserveWon = parseRequiredMoney(
    draft.irregularEssentialReserveWon,
    "profile.irregularEssentialReserveWon",
    "비정기 필수비용 준비금",
    errors,
  );
  const contractualDebtPaymentsWon = parseRequiredMoney(
    draft.contractualDebtPaymentsWon,
    "profile.contractualDebtPaymentsWon",
    "약정 부채상환액",
    errors,
  );
  const plannedFlexibleSpendWon = parseRequiredMoney(
    draft.plannedFlexibleSpendWon,
    "profile.plannedFlexibleSpendWon",
    "자유지출 예산",
    errors,
  );
  const currentEmergencyFundWon = parseRequiredMoney(
    draft.currentEmergencyFundWon,
    "profile.currentEmergencyFundWon",
    "현재 비상자금",
    errors,
  );

  if (monthlyNetIncomeWon === 0) {
    errors["profile.monthlyNetIncomeWon"] = "세후 월급은 1원 이상 입력해 주세요.";
  }

  if (
    draft.emergencyTargetMonths === null ||
    !Number.isInteger(draft.emergencyTargetMonths) ||
    draft.emergencyTargetMonths < 0 ||
    draft.emergencyTargetMonths > 12
  ) {
    errors["profile.emergencyTargetMonths"] = "비상자금 목표를 0~12개월에서 직접 선택해 주세요.";
  }

  if (draft.longTermGoalEnabled === null) {
    errors["profile.longTermGoalEnabled"] = "장기목표 몫을 표시할지 직접 선택해 주세요.";
  }

  if (draft.goals.length > 50) {
    errors["profile.goals"] = "목표는 최대 50개까지 등록할 수 있어요.";
  }

  const seenIds = new Set<string>();
  const goals: GoalInput[] = draft.goals.map((goal, index) => {
    const base = `profile.goals[${index}]`;
    const label = goal.label.trim();
    if (!label) errors[`${base}.label`] = "목표 이름을 입력해 주세요.";
    if (seenIds.has(goal.id)) errors[`${base}.id`] = "목표를 다시 추가해 주세요.";
    seenIds.add(goal.id);

    const targetWon = parseRequiredMoney(goal.targetWon, `${base}.targetWon`, "목표금액", errors);
    const savedWon = parseRequiredMoney(goal.savedWon, `${base}.savedWon`, "현재 모은 금액", errors);
    const monthsRemaining = Number(goal.monthsRemaining);
    if (!/^\d+$/u.test(goal.monthsRemaining) || !Number.isInteger(monthsRemaining) || monthsRemaining < 1 || monthsRemaining > 600) {
      errors[`${base}.monthsRemaining`] = "남은 기간을 1~600개월로 입력해 주세요.";
    }

    return {
      id: goal.id,
      label,
      kind: goal.kind,
      targetWon: targetWon ?? 0,
      savedWon: savedWon ?? 0,
      monthsRemaining: Number.isInteger(monthsRemaining) ? monthsRemaining : 0,
      userPriority: index + 1,
    };
  });

  if (Object.keys(errors).length > 0) return null;

  return {
    monthlyNetIncomeWon: monthlyNetIncomeWon!,
    fixedEssentialWon: fixedEssentialWon!,
    variableEssentialWon: variableEssentialWon!,
    irregularEssentialReserveWon: irregularEssentialReserveWon!,
    contractualDebtPaymentsWon: contractualDebtPaymentsWon!,
    plannedFlexibleSpendWon: plannedFlexibleSpendWon!,
    currentEmergencyFundWon: currentEmergencyFundWon!,
    emergencyTargetMonths: draft.emergencyTargetMonths!,
    longTermGoalEnabled: draft.longTermGoalEnabled!,
    goals,
  };
}

export function buildMonthlyInput(
  draft: MonthlyFormDraft,
  asOf = todayInKorea(),
): FormBuildResult<MonthlyPlanInput> {
  const errors: FormErrors = {};
  const profile = buildProfile(draft.profile, errors);
  const currentCycleRequiredShortfallWon = parseRequiredMoney(
    draft.currentCycleRequiredShortfallWon,
    "currentCycleRequiredShortfallWon",
    "이번 달 추가 확정지출",
    errors,
  );

  if (!profile || currentCycleRequiredShortfallWon === null || Object.keys(errors).length > 0) {
    return { value: null, errors };
  }

  return {
    value: {
      mode: "MONTHLY_SALARY",
      asOf,
      profile,
      currentCycleRequiredShortfallWon,
    },
    errors,
  };
}

export function monthlyStructuralDeficitWon(profile: ProfileDraft): number | null {
  const errors: FormErrors = {};
  const built = buildProfile(profile, errors);
  if (!built) return null;
  const core =
    built.fixedEssentialWon +
    (built.variableEssentialWon ?? 0) +
    built.irregularEssentialReserveWon +
    built.contractualDebtPaymentsWon;
  return Math.max(0, core - built.monthlyNetIncomeWon);
}

export function buildWindfallInput(
  profileDraft: ProfileDraft,
  draft: WindfallFormDraft,
  asOf = todayInKorea(),
): FormBuildResult<WindfallPlanInput> {
  const errors: FormErrors = {};
  const profile = buildProfile(profileDraft, errors);
  const amountWon = parseRequiredMoney(draft.amountWon, "amountWon", "여윳돈", errors);
  const taxReserveWon = parseRequiredMoney(draft.taxReserveWon, "taxReserveWon", "세금 준비금", errors);
  const nearTermReserveWon = parseRequiredMoney(
    draft.nearTermReserveWon,
    "nearTermReserveWon",
    "단기 사용 예정액",
    errors,
  );

  if (amountWon === 0) errors.amountWon = "여윳돈은 1원 이상 입력해 주세요.";
  if (
    amountWon !== null &&
    taxReserveWon !== null &&
    nearTermReserveWon !== null &&
    taxReserveWon + nearTermReserveWon > amountWon
  ) {
    errors.amountWon = "세금 준비금과 단기 사용 예정액의 합계가 여윳돈보다 많아요.";
  }

  let deficitCoverageMonths = 0;
  if (profile) {
    const core =
      profile.fixedEssentialWon +
      (profile.variableEssentialWon ?? 0) +
      profile.irregularEssentialReserveWon +
      profile.contractualDebtPaymentsWon;
    const hasDeficit = core > profile.monthlyNetIncomeWon;
    if (hasDeficit) {
      if (
        draft.deficitCoverageMonths === null ||
        draft.deficitCoverageMonths < 1 ||
        draft.deficitCoverageMonths > 12
      ) {
        errors.deficitCoverageMonths = "월 부족분을 몇 개월치 먼저 둘지 1~12개월에서 선택해 주세요.";
      } else {
        deficitCoverageMonths = draft.deficitCoverageMonths;
      }
    }

    profile.goals = profile.goals.map((goal, index) => {
      const catchUpWon = parseOptionalMoney(
        draft.goalCatchUps[goal.id],
        `goalCatchUps.${goal.id}`,
        `${goal.label} 추가 적립액`,
        errors,
      );
      return { ...goal, windfallCatchUpWon: catchUpWon ?? 0, userPriority: index + 1 };
    });
  }

  if (
    !profile ||
    amountWon === null ||
    taxReserveWon === null ||
    nearTermReserveWon === null ||
    Object.keys(errors).length > 0
  ) {
    return { value: null, errors };
  }

  return {
    value: {
      mode: "WINDFALL",
      asOf,
      profile,
      amountWon,
      taxReserveWon,
      nearTermReserveWon,
      deficitCoverageMonths,
    },
    errors,
  };
}
