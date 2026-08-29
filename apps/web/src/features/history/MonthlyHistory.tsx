import { formatWon } from "../../domain/plan-form";
import type { StoredPlanRun } from "../../persistence/db";
import { buildMonthlyHistory } from "./monthly-history";

interface MonthlyHistoryProps {
  planRuns: readonly StoredPlanRun[];
  onOpenPlan: (plan: StoredPlanRun) => void;
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <small>첫 기록</small>;
  if (value === 0) return <small>변화 없음</small>;
  return <small>직전 월 대비 {value > 0 ? "+" : "-"}{formatWon(Math.abs(value))}</small>;
}

export function MonthlyHistory({ planRuns, onOpenPlan }: MonthlyHistoryProps) {
  const entries = buildMonthlyHistory(planRuns);
  if (entries.length === 0) return null;

  return (
    <section className="monthly-history" aria-labelledby="monthly-history-title">
      <div className="section-heading section-heading--row">
        <div><span className="eyebrow">월별 변화</span><h3 id="monthly-history-title">월급 계획이 어떻게 달라졌는지</h3></div>
        <span>월별 마지막 저장 기준 · 최대 12개월</span>
      </div>
      {entries.length === 1 ? <p className="monthly-history__notice">월급 계획이 한 달 더 쌓이면 직전 월과의 차이를 보여드릴게요.</p> : null}
      <div className="monthly-history__table-wrap">
        <table>
          <caption className="sr-only">월별 마지막 월급 계획의 세후 월급, 핵심 월비용과 배분 가능액 비교</caption>
          <thead><tr><th scope="col">기준 월</th><th scope="col">세후 월급</th><th scope="col">핵심 월비용</th><th scope="col">배분 가능액</th><th scope="col"><span className="sr-only">저장 계획 열기</span></th></tr></thead>
          <tbody>
            {entries.map((entry) => {
              const plan = planRuns.find((stored) => stored.id === entry.id);
              return (
                <tr key={entry.monthKey}>
                  <th scope="row">{entry.monthLabel}<small>{new Date(entry.createdAt).toLocaleDateString("ko-KR")}</small></th>
                  <td><strong>{formatWon(entry.monthlyNetIncomeWon)}</strong><Delta value={entry.monthlyNetIncomeDeltaWon} /></td>
                  <td><strong>{formatWon(entry.coreMonthlyCostWon)}</strong><Delta value={entry.coreMonthlyCostDeltaWon} /></td>
                  <td><strong>{formatWon(entry.deployableWon)}</strong><Delta value={entry.deployableDeltaWon} /></td>
                  <td>{plan ? <button type="button" onClick={() => onOpenPlan(plan)}>보기</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
