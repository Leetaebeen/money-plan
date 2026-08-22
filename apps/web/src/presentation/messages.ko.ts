import type {
  AllocationBucket,
  Explanation,
  PreAllocationBucket,
  ScenarioId,
  ValidationIssue,
} from "@money-plan/finance-engine";
import { formatWon } from "../domain/plan-form";

export const scenarioNames: Record<ScenarioId, string> = {
  SAFE: "비상자금 중심",
  BALANCED: "고른 배분",
  GROWTH: "장기목표 중심",
};

export const scenarioDescriptions: Record<ScenarioId, string> = {
  SAFE: "비상자금 몫을 상대적으로 크게 두는 비교안",
  BALANCED: "비상자금·등록 목표·장기목표를 고르게 보는 비교안",
  GROWTH: "5년 이상 장기목표 몫을 상대적으로 크게 보는 비교안",
};

export const bucketNames: Record<AllocationBucket, string> = {
  EMERGENCY_RESERVE: "비상자금",
  USER_GOALS: "등록한 목표",
  LONG_TERM_GOAL: "장기목표",
  UNASSIGNED: "직접 결정할 돈",
};

export const preAllocationNames: Record<PreAllocationBucket, string> = {
  CURRENT_CYCLE_RESERVE: "이번 달 추가 확정지출",
  TAX_RESERVE: "세금 준비금",
  NEAR_TERM_RESERVE: "단기 사용 예정액",
  DEFICIT_RESERVE: "월 부족분 대응 준비금",
};

export function explanationMessage(explanation: Explanation): string | null {
  switch (explanation.code) {
    case "USER_MUST_SELECT_SCENARIO":
      return null;
    case "EMERGENCY_TARGET_ALREADY_CAPPED":
      return "비상자금 목표를 넘는 금액은 직접 결정할 돈으로 남겼어요.";
    case "LONG_TERM_BUCKET_DISABLED_BY_USER":
      return "장기목표를 표시하지 않기로 선택해 해당 금액을 직접 결정할 돈으로 남겼어요.";
    case "EMERGENCY_GAP_REMAINS":
      return `이 안을 적용해도 비상자금 목표까지 ${formatWon(Number(explanation.params.remainingWon ?? 0))}이 남아요.`;
    case "USER_GOAL_AMOUNT_SHORTFALL":
      return `등록한 목표의 이번 달 필요액보다 ${formatWon(Number(explanation.params.shortfallWon ?? 0))}이 부족해요.`;
    case "UNASSIGNED_AMOUNT_NEEDS_USER_REVIEW":
      return `목표 상한과 1,000원 단위 조정 후 ${formatWon(Number(explanation.params.amountWon ?? 0))}은 직접 결정할 돈으로 남겼어요.`;
    default:
      return "이 계산안에는 직접 확인해야 할 조건이 있어요.";
  }
}

export function issueMessage(issue: ValidationIssue): string {
  switch (issue.code) {
    case "MONTHLY_INCOME_REQUIRED":
      return "세후 월급을 입력해 주세요.";
    case "VARIABLE_ESSENTIAL_REQUIRED":
      return "식비·교통비 등 월평균 필수생활비를 입력해 주세요.";
    case "INVALID_EMERGENCY_TARGET_MONTHS":
      return "비상자금 목표를 0~12개월에서 선택해 주세요.";
    case "INVALID_LONG_TERM_CHOICE":
      return "장기목표 몫을 표시할지 선택해 주세요.";
    case "GOAL_LABEL_REQUIRED":
      return "목표 이름을 입력해 주세요.";
    case "INVALID_GOAL_MONTHS":
      return "목표까지 남은 기간을 1~600개월로 입력해 주세요.";
    case "WINDFALL_RESERVES_EXCEED_AMOUNT":
      return "세금 준비금과 단기 사용 예정액의 합계가 여윳돈보다 많아요.";
    case "INVALID_MONEY":
      return "0원 이상 1조 원 이하의 원 단위 금액을 입력해 주세요.";
    default:
      return "입력값을 다시 확인해 주세요.";
  }
}

export const educationalDisclosure =
  "입력값과 사용자가 직접 선택한 가정에 따른 예산 계산·교육용 시나리오입니다. 특정 금융상품의 가입·매수·매도 또는 수익을 권유하거나 보장하지 않습니다.";
