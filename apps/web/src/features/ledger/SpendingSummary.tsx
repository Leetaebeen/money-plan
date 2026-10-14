import { useMemo, useState } from "react";
import { today, won, type Entry } from "./model";
import {
  spendingSummary,
  type compareMonthlySpending,
} from "./spending-summary";

export function SpendingSummary({
  entries,
  selected,
  onSelect,
  comparison,
}: {
  entries: Entry[];
  selected: string;
  onSelect: (category: string) => void;
  comparison?: ReturnType<typeof compareMonthlySpending>;
}) {
  const asOf = today();
  const report = useMemo(() => spendingSummary(entries, asOf), [entries, asOf]);
  const [limit, setLimit] = useState(8);
  const [changeLimit, setChangeLimit] = useState(6);
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
        검색·월·계좌·종류 조건에 맞는 오늘까지의 지출·환불 {report.count}건
        기준입니다. 카드 결제대금·대출 원금·저축 이체와 잔액 조정은 제외합니다.
        환불은 받은 날짜의 카테고리에서 차감하며 지출보다 많으면 음수로
        표시합니다. 누락된 내역은 반영되지 않습니다.
      </p>
      {comparison && (
        <div>
          <h4>전월과 소비 비교</h4>
          <p className="ledger-note">
            {comparison.start} ~ {comparison.end}: {won(comparison.current.net)}{" "}
            ({comparison.current.count}건)
            <br />
            {comparison.previousStart} ~ {comparison.previousEnd}:{" "}
            {won(comparison.previous.net)} ({comparison.previous.count}건)
          </p>
          <p>
            {comparison.difference === null
              ? "한쪽 비교 기간의 지출·환불 기록이 없어 증감을 계산하지 않습니다."
              : comparison.difference === 0
                ? "기록된 소비 금액이 같습니다."
                : `전월 비교 기간보다 ${won(Math.abs(comparison.difference))} ${comparison.difference > 0 ? "증가" : "감소"}`}
          </p>
          <p className="ledger-note">
            이번 달은 오늘까지와 전월 같은 일자까지(없는 날짜는 말일), 지난달은
            각 월 전체를 비교합니다. 조회 월 외의 검색·계좌·종류 필터를 동일하게
            적용한 환불 차감 소비입니다. 기록이 없는 기간의 실제 소비를 0원으로
            확정하지 않으며, 계좌 기록 시작일과 누락 여부를 확인하세요.
          </p>
          {comparison.difference !== null && (
            <details>
              <summary>
                소비 변화가 큰 카테고리 ({comparison.changes.length}개)
              </summary>
              <p className="ledger-note">
                환불 차감 소비의 변화 금액이 큰 순서입니다. 한쪽 기간에 해당
                카테고리 기록이 없으면 기록된 금액을 0원으로 비교합니다.
                환불이나 카테고리 수정도 증감에 영향을 줍니다.
              </p>
              {!comparison.changes.length && (
                <p>카테고리별 기록 금액에 변화가 없습니다.</p>
              )}
              {comparison.changes.slice(0, changeLimit).map((row) => (
                <article className="ledger-funding-goal" key={row.category}>
                  <h4>
                    {row.category} · {won(Math.abs(row.difference))}{" "}
                    {row.difference > 0 ? "증가" : "감소"}
                  </h4>
                  <p className="ledger-note">
                    전월 {won(row.previous)} ({row.previousCount}건) → 조회 월{" "}
                    {won(row.current)} ({row.currentCount}건)
                  </p>
                  {row.currentCount > 0 ? (
                    <button
                      className="ledger-text-btn"
                      aria-pressed={selected === row.category}
                      onClick={() =>
                        onSelect(selected === row.category ? "" : row.category)
                      }
                    >
                      {row.category} 조회 월 내역 보기
                    </button>
                  ) : (
                    <p className="ledger-note">
                      조회 월에는 해당 카테고리 기록이 없습니다.
                    </p>
                  )}
                </article>
              ))}
              {comparison.changes.length > changeLimit && (
                <button
                  className="ledger-text-btn"
                  onClick={() => setChangeLimit(changeLimit + 6)}
                >
                  소비 변화 더 보기
                </button>
              )}
            </details>
          )}
        </div>
      )}
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
