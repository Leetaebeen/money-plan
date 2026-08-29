import type { StoredPlanRun } from "../../persistence/db";

export interface MonthlyHistoryEntry {
  id: string;
  monthKey: string;
  monthLabel: string;
  createdAt: string;
  monthlyNetIncomeWon: number;
  coreMonthlyCostWon: number;
  deployableWon: number;
  monthlyNetIncomeDeltaWon: number | null;
  coreMonthlyCostDeltaWon: number | null;
  deployableDeltaWon: number | null;
}

function koreaMonth(createdAt: string): { key: string; label: string } {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(createdAt));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new TypeError("저장 계획의 날짜를 확인하지 못했어요.");
  const normalizedMonth = month.padStart(2, "0");
  return { key: `${year}-${normalizedMonth}`, label: `${year}년 ${Number(month)}월` };
}

export function buildMonthlyHistory(
  planRuns: readonly StoredPlanRun[],
  limit = 12,
): MonthlyHistoryEntry[] {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("월별 변화 개수는 1개 이상이어야 합니다.");

  const latestByMonth = new Map<string, Omit<MonthlyHistoryEntry,
    "monthlyNetIncomeDeltaWon" | "coreMonthlyCostDeltaWon" | "deployableDeltaWon">>();

  for (const plan of [...planRuns].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (plan.mode !== "MONTHLY_SALARY" || plan.input.mode !== "MONTHLY_SALARY" || !plan.result.derived) continue;
    const month = koreaMonth(plan.createdAt);
    latestByMonth.set(month.key, {
      id: plan.id,
      monthKey: month.key,
      monthLabel: month.label,
      createdAt: plan.createdAt,
      monthlyNetIncomeWon: plan.input.profile.monthlyNetIncomeWon,
      coreMonthlyCostWon: plan.result.derived.coreMonthlyCostWon,
      deployableWon: plan.result.derived.deployableWon,
    });
  }

  const chronological = [...latestByMonth.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .slice(-limit);

  return chronological.map((entry, index) => {
    const previous = chronological[index - 1];
    return {
      ...entry,
      monthlyNetIncomeDeltaWon: previous ? entry.monthlyNetIncomeWon - previous.monthlyNetIncomeWon : null,
      coreMonthlyCostDeltaWon: previous ? entry.coreMonthlyCostWon - previous.coreMonthlyCostWon : null,
      deployableDeltaWon: previous ? entry.deployableWon - previous.deployableWon : null,
    };
  }).reverse();
}
