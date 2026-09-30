import {
  goalMetrics,
  goalUsesSpendingAccount,
  MAX_WON,
  planRemainder,
  today,
  validDate,
  type Ledger,
} from "./model.ts";

export function goalScenario(
  data: Ledger,
  goalId: string,
  extraMonthly: number,
  livingCut: number,
  asOf = today(),
) {
  if (!validDate(asOf)) throw new Error("계산 기준일을 확인해 주세요.");
  for (const value of [extraMonthly, livingCut]) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_WON)
      throw new Error(
        "조정 금액은 0원 이상 1조 원 이내의 정수로 입력해 주세요.",
      );
  }
  const goal = data.goals.find((g) => g.id === goalId);
  if (!goal) throw new Error("비교할 목표를 선택해 주세요.");
  const plan = data.monthlyPlan;
  if (livingCut > (plan?.livingAmount ?? 0))
    throw new Error(
      "생활비 절감액은 월급 계획의 생활비 예산 이내로 입력해 주세요.",
    );
  if (plan && goalUsesSpendingAccount(goal, plan))
    throw new Error(
      "쓸 돈과 목표 자금이 섞여 있어요. 목표에 저축용 계좌를 연결해 주세요.",
    );
  const before = goalMetrics(goal, data, asOf);
  if (!before)
    throw new Error(
      "목표에 연결한 모든 계좌의 시작 잔액과 기준일을 먼저 확인해 주세요.",
    );
  if (before.remaining === 0)
    throw new Error(
      "이미 달성한 목표입니다. 새 목표 금액을 정한 뒤 비교해 주세요.",
    );
  const monthly = before.monthly + extraMonthly;
  if (!Number.isSafeInteger(monthly))
    throw new Error("계산 가능한 금액 범위를 초과했습니다.");
  // Override only this goal's contribution for a read-only projection.
  const after = goalMetrics(
    { ...goal, monthly },
    { ...data, monthlyPlan: null },
    asOf,
  )!;
  const remainder = plan ? planRemainder(plan) : null;
  const adjustedRemainder =
    remainder === null ? null : remainder + livingCut - extraMonthly;
  return {
    before,
    after,
    extraMonthly,
    livingCut,
    monthsEarlier:
      before.paymentCount === null || after.paymentCount === null
        ? null
        : before.paymentCount - after.paymentCount,
    meetsDeadline: after.projected !== null && after.projected <= goal.deadline,
    funding:
      adjustedRemainder === null
        ? null
        : {
            currentDeficit: Math.max(0, -remainder!),
            additionalNeeded: Math.max(0, -adjustedRemainder),
            unassigned: Math.max(0, adjustedRemainder),
            livingAfter: plan!.livingAmount - livingCut,
          },
  };
}
