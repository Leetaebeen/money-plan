import { useMemo } from "react";
import { today, won, type Ledger } from "./model";
import { wealthHistory } from "./wealth-history";

export function WealthHistory({ data }: { data: Ledger }) {
  const asOf = today();
  const rows = useMemo(() => wealthHistory(data, asOf), [data, asOf]);
  return (
    <section className="ledger-panel" aria-label="최근 6개월 순자산 추이">
      <h3>최근 6개월 순자산</h3>
      <p className="ledger-note">
        지난달까지는 월말, 이번 달은 {asOf}까지의 기록 기준입니다. 현재 등록된
        계좌의 기준 잔액과 거래로 다시 계산하며, 계좌 삭제나 과거 기록 수정 시
        추이도 바뀝니다.
      </p>
      <div
        className="ledger-history-scroll"
        tabIndex={0}
        role="region"
        aria-label="월별 순자산 표, 좌우로 스크롤 가능"
      >
        <table className="ledger-history-table">
          <thead>
            <tr>
              <th scope="col">기준일</th>
              <th scope="col">자산</th>
              <th scope="col">부채</th>
              <th scope="col">순자산</th>
              <th scope="col">전월 대비</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <th scope="row">
                  {row.date}
                  {row.current ? " (현재)" : ""}
                </th>
                <td>{row.net === null ? "확인 필요" : won(row.assets)}</td>
                <td>{row.net === null ? "확인 필요" : won(row.debt)}</td>
                <td>{row.net === null ? "확인 필요" : won(row.net)}</td>
                <td>
                  {row.change === null
                    ? "비교 불가"
                    : `${row.change > 0 ? "+" : ""}${won(row.change)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ledger-note">
        계좌의 기준일이 늦거나 시작 잔액을 모르면 해당 달 전체 합계와 전월
        비교를 보류합니다. 전월 대비는 수입·소비·평가액 조정 등을 포함한
        변화이며 투자 수익률이 아닙니다. 누락된 거래와 기록하지 않은 시세 변동은
        반영되지 않습니다.
      </p>
    </section>
  );
}
