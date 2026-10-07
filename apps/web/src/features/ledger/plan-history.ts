import {
  today,
  validDate,
  validateLedger,
  validateMonthlyPlan,
  type Ledger,
} from "./model.ts";

export function captureMonthlyPlan(data: Ledger, asOf = today()) {
  if (!validDate(asOf) || asOf > today() || !data.monthlyPlan)
    throw new Error("저장할 월급 계획과 기준일을 확인해 주세요.");
  validateMonthlyPlan(data.monthlyPlan, data.accounts);
  const month = asOf.slice(0, 7);
  const index = data.planHistory.findIndex((s) => s.month === month);
  if (index < 0 && data.planHistory.length >= 120)
    throw new Error(
      "월별 계획은 최대 120개입니다. 오래된 이력을 정리해 주세요.",
    );
  const snapshot = structuredClone({
    month,
    savedAt: asOf,
    plan: data.monthlyPlan,
    accounts: data.accounts,
    goals: data.goals,
  });
  if (index < 0) data.planHistory.push(snapshot);
  else data.planHistory[index] = snapshot;
}

export function validatePlanHistory(data: Ledger) {
  if (!Array.isArray(data.planHistory) || data.planHistory.length > 120)
    throw new Error("월별 계획 이력을 확인해 주세요 (최대 120개).");
  const months = new Set<string>();
  for (const snapshot of data.planHistory) {
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      !validDate(`${snapshot.month}-01`) ||
      !validDate(snapshot.savedAt) ||
      snapshot.savedAt > today() ||
      snapshot.savedAt.slice(0, 7) !== snapshot.month ||
      months.has(snapshot.month) ||
      snapshot.plan === null
    )
      throw new Error("월별 계획의 조회 월·저장일·중복 여부를 확인해 주세요.");
    months.add(snapshot.month);
    // Validate against the archived accounts, not today's renamed/deleted accounts.
    validateLedger({
      schemaVersion: 5,
      accounts: snapshot.accounts,
      goals: snapshot.goals,
      monthlyPlan: snapshot.plan,
      entries: [],
      batches: [],
      schedules: [],
      maturities: [],
      planHistory: [],
    });
  }
}
