import { useMemo } from "react";
import { today, won, type Goal, type Ledger } from "./model";
import { goalHistory } from "./goal-history";

export function GoalHistory({ goal, data }: { goal: Goal; data: Ledger }) {
  const asOf = today();
  const rows = useMemo(() => goalHistory(goal, data, asOf), [goal, data, asOf]);
  return (
    <details>
      <summary>최근 6개월 목표 진행</summary>
      <p className="ledger-note">
        지난달까지는 월말, 이번 달은 {asOf} 기준입니다. 현재 연결한 계좌와
        목표액
        {won(goal.target)}으로 과거 기록을 다시 계산합니다.
      </p>
      <div
        className="ledger-history-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${goal.name} 월별 진행 표, 좌우로 스크롤 가능`}
      >
        <table className="ledger-history-table">
          <thead>
            <tr>
              <th scope="col">기준일</th>
              <th scope="col">모은 금액</th>
              <th scope="col">전월 대비</th>
              <th scope="col">남은 목표액</th>
              <th scope="col">달성률</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <th scope="row">{row.date}</th>
                <td>{row.saved === null ? "확인 필요" : won(row.saved)}</td>
                <td>
                  {row.change === null
                    ? "비교 불가"
                    : `${row.change > 0 ? "+" : ""}${won(row.change)}`}
                </td>
                <td>
                  {row.remaining === null ? "확인 필요" : won(row.remaining)}
                </td>
                <td>
                  {row.percent === null ? "확인 필요" : `${row.percent}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ledger-note">
        잔액 기준일 이전이거나 연결 계좌의 잔액이 없으면 합계·비교를 보류합니다.
        입출금과 평가액 조정이 모두 포함된 변화이며 저축 납입액이나 투자
        수익률은 아닙니다. 목표액·연결 계좌·과거 거래를 수정하면 이 표도
        달라집니다.
      </p>
    </details>
  );
}
