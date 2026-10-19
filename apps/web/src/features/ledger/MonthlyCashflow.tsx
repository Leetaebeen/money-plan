import { monthlyCashflow } from "./monthly-cashflow";
import { won, type Entry } from "./model";

export function MonthlyCashflow({
  entries,
  month,
}: {
  entries: Entry[];
  month: string;
}) {
  const rows = monthlyCashflow(entries, month);
  return (
    <section aria-label="최근 6개월 수입과 소비">
      <h4>최근 6개월 수입·소비</h4>
      <p className="ledger-note">
        선택한 달까지의 기록을 비교합니다. 이번 달은 오늘까지이며 지난달 전체와
        기간이 다릅니다. 이체·잔액 조정은 제외하고 환불은 받은 달에 반영합니다.
      </p>
      <div
        className="ledger-history-scroll"
        role="region"
        aria-label="월별 수입 소비 표, 좌우로 스크롤 가능"
        tabIndex={0}
      >
        <table className="ledger-history-table">
          <thead>
            <tr>
              <th scope="col">기간 종료일</th>
              <th scope="col">수입·소비 건수</th>
              <th scope="col">수입</th>
              <th scope="col">순소비</th>
              <th scope="col">수입 − 순소비</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <th scope="row">{row.end}</th>
                <td>{row.count}건</td>
                <td>{row.count ? won(row.income) : "기록 없음"}</td>
                <td>{row.count ? won(row.netSpent) : "기록 없음"}</td>
                <td>{row.count ? won(row.difference) : "확인 불가"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ledger-note">
        순소비는 지출에서 환불을 뺀 값입니다. 기록이 있는 달도 누락 여부는 알 수
        없습니다. 수입과 순소비의 차이는 실제 저축액·현재 잔액·투자 수익이
        아닙니다.
      </p>
    </section>
  );
}
