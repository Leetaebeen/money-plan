import { useMemo, useState } from "react";
import { annualContributions } from "./annual-contributions";
import { roles, today, won, type Ledger } from "./model";

export function AnnualContributions({ data }: { data: Ledger }) {
  const asOf = today();
  const currentYear = Number(asOf.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const rows = useMemo(
    () => annualContributions(data, year, asOf),
    [data, year, asOf],
  );
  if (!rows.length) return null;
  return (
    <section className="ledger-panel" aria-label="ISA·연금저축 연간 입출금">
      <h3>ISA·연금저축에 올해 얼마나 옮겼나요?</h3>
      <label>
        입출금 조회 연도
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: currentYear - 1999 }, (_, i) => (
            <option key={currentYear - i} value={currentYear - i}>
              {currentYear - i}년
            </option>
          ))}
        </select>
      </label>
      <p className="ledger-note">
        계좌 이동으로 기록한 입금·출금을 합산합니다. 수입·환불·평가액 조정은
        제외하며 세액공제 대상 납입액이나 법정 한도 계산이 아닙니다. 기관 간
        이전·인출·계좌 유형 변경과 기록 누락에 따라 금융기관의 납입 내역과 다를
        수 있습니다.
      </p>
      {rows.map((row) => (
        <article className="ledger-funding-goal" key={row.account.id}>
          <h4>
            {row.account.name} · {roles[row.account.role]}
          </h4>
          <p className="ledger-note">
            {row.start} ~ {row.end} · 기록된 이체 {row.count}건
          </p>
          <dl className="ledger-budget-breakdown">
            <div>
              <dt>입금 이체</dt>
              <dd>{won(row.deposited)}</dd>
            </div>
            <div>
              <dt>출금 이체</dt>
              <dd>{won(row.withdrawn)}</dd>
            </div>
            <div>
              <dt>순입금</dt>
              <dd>{won(row.net)}</dd>
            </div>
          </dl>
          {row.partial && (
            <p className="ledger-note">
              계좌 기록 기준일이 연초보다 늦어 이전 기간의 내역은 포함되지
              않습니다.
            </p>
          )}
          {row.unpaired > 0 && (
            <p className="ledger-note">
              상대 계좌가 연결되지 않은 이체 {row.unpaired}건이 포함되어
              있습니다. 금융기관 내역과 함께 확인하세요.
            </p>
          )}
          <details>
            <summary>월별 입출금 보기</summary>
            <div
              className="ledger-history-scroll"
              tabIndex={0}
              role="region"
              aria-label={`${row.account.name} 월별 입출금 표`}
            >
              <table className="ledger-history-table">
                <thead>
                  <tr>
                    <th scope="col">월</th>
                    <th scope="col">입금</th>
                    <th scope="col">출금</th>
                    <th scope="col">순입금</th>
                  </tr>
                </thead>
                <tbody>
                  {row.months.map((m) => (
                    <tr key={m.month}>
                      <th scope="row">{m.month}</th>
                      <td>{won(m.deposited)}</td>
                      <td>{won(m.withdrawn)}</td>
                      <td>{won(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </article>
      ))}
    </section>
  );
}
