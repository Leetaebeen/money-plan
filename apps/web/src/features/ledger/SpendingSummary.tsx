import { useMemo, useState } from "react";
import { today, won, type Entry } from "./model";
import { spendingSummary } from "./spending-summary";

export function SpendingSummary({
  entries,
  selected,
  onSelect,
}: {
  entries: Entry[];
  selected: string;
  onSelect: (category: string) => void;
}) {
  const asOf = today();
  const report = useMemo(() => spendingSummary(entries, asOf), [entries, asOf]);
  const [limit, setLimit] = useState(8);
  return (
    <section className="ledger-panel" aria-label="카테고리별 소비 요약">
      <h3>조회 조건의 소비</h3>
      <dl className="ledger-budget-breakdown">
        <div>
          <dt>지출</dt>
          <dd>{won(report.spent)}</dd>
        </div>
        <div>
          <dt>환불</dt>
          <dd>{won(report.refunded)}</dd>
        </div>
        <div>
          <dt>환불 차감 소비</dt>
          <dd>{won(report.net)}</dd>
        </div>
      </dl>
      <p className="ledger-note">
        오늘까지 기록된 지출·환불 {report.count}건 기준입니다. 카드
        결제대금·대출 원금·저축 이체와 잔액 조정은 제외합니다. 환불은 받은
        날짜의 카테고리에서 차감하며 지출보다 많으면 음수로 표시합니다. 누락된
        내역은 반영되지 않습니다.
      </p>
      <details>
        <summary>카테고리별 보기 ({report.rows.length}개)</summary>
        {!report.rows.length && <p>집계할 지출·환불이 없습니다.</p>}
        {report.rows.slice(0, limit).map((row) => (
          <article className="ledger-funding-goal" key={row.category}>
            <button
              className="ledger-text-btn"
              aria-pressed={selected === row.category}
              onClick={() =>
                onSelect(selected === row.category ? "" : row.category)
              }
            >
              {row.category} · {won(row.net)} · 내역 보기
            </button>
            <p className="ledger-note">
              지출 {won(row.spent)} · 환불 {won(row.refunded)} · {row.count}건
            </p>
          </article>
        ))}
        {report.rows.length > limit && (
          <button
            className="ledger-text-btn"
            onClick={() => setLimit(limit + 8)}
          >
            카테고리 더 보기
          </button>
        )}
      </details>
      {selected && (
        <p>
          거래 목록: {selected}{" "}
          <button className="ledger-text-btn" onClick={() => onSelect("")}>
            카테고리 필터 해제
          </button>
        </p>
      )}
    </section>
  );
}
