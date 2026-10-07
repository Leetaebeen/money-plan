import { useState } from "react";
import { savingsActuals } from "./savings-actuals";
import { today, won } from "./model";
import { captureMonthlyPlan } from "./plan-history";
import type { PanelProps } from "./shared";

export function SavingsActuals({ data, busy, change }: PanelProps) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [error, setError] = useState("");
  const result = savingsActuals(data, month);
  const entries = data.entries.filter(
    (e) => e.date >= result.start && e.date <= result.end,
  );
  const income = entries
    .filter((e) => e.kind === "INCOME")
    .reduce((n, e) => n + e.amount, 0);
  const expenses = entries
    .filter((e) => e.kind === "EXPENSE")
    .reduce((n, e) => n - e.amount, 0);
  const refunds = entries
    .filter((e) => e.kind === "REFUND")
    .reduce((n, e) => n + e.amount, 0);
  return (
    <section className="ledger-panel" aria-label="월 저축 실적">
      <div className="ledger-section-title">
        <div>
          <h3>계획대로 모으고 있나요?</h3>
          <p>실제로 기록한 계좌 이동으로 확인해요.</p>
        </div>
      </div>
      <label className="ledger-actual-month">
        실적 조회 월
        <input
          type="month"
          min="2000-01"
          max={today().slice(0, 7)}
          value={month}
          onChange={(e) => {
            try {
              savingsActuals(data, e.target.value);
              setMonth(e.target.value);
              setError("");
            } catch {
              setError("오늘까지의 조회 월을 선택해 주세요.");
            }
          }}
        />
      </label>
      {error && (
        <p className="ledger-error" role="alert">
          {error}
        </p>
      )}
      <p className="ledger-note">
        {result.start} ~ {result.end} ·{" "}
        {result.source === "snapshot"
          ? `${result.snapshot!.savedAt}에 보관한 계획 기준`
          : result.source === "current"
            ? "이번 달 현재 계획 기준 · 이력 미보관"
            : "계획 이력 없음 · 계획 대비 부족액은 미확정"}
      </p>
      <div className="ledger-actions">
        {month === today().slice(0, 7) && data.monthlyPlan && (
          <button
            className="ledger-btn"
            disabled={busy}
            onClick={() => {
              if (
                !result.snapshot ||
                window.confirm(
                  "이번 달에 보관한 계획을 현재 계획·계좌·목표 정보로 교체할까요? 다른 달의 이력은 유지됩니다.",
                )
              )
                void change(
                  (next) => captureMonthlyPlan(next),
                  "이번 달 계획 이력을 보관했어요.",
                );
            }}
          >
            {result.snapshot ? "이번 달 이력 갱신" : "이번 달 계획 보관"}
          </button>
        )}
        {result.snapshot && (
          <button
            className="ledger-text-btn"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `${month} 계획 이력을 삭제할까요? 실제 거래와 현재 계획은 유지됩니다.`,
                )
              )
                void change((next) => {
                  next.planHistory = next.planHistory.filter(
                    (s) => s.month !== month,
                  );
                }, "선택한 달의 계획 이력을 삭제했어요.");
            }}
          >
            이 달의 계획 이력 삭제
          </button>
        )}
      </div>
      <p className="ledger-note">
        월급 계획을 저장하면 이번 달 이력도 갱신됩니다. 한 달에 마지막으로
        저장한 계획 하나를 보관하며, 과거 이력이 없는 달은 소급해서 만들지
        않습니다. 보관된 계좌·목표 기준으로 현재 남아 있는 거래를 다시
        집계하므로 거래 수정 시 실적은 달라집니다.
      </p>
      {result.plan && (
        <dl className="ledger-budget-breakdown">
          <div>
            <dt>보관/비교 계획의 월급</dt>
            <dd>{won(result.plan.netIncome)}</dd>
          </div>
          <div>
            <dt>고정비 계획</dt>
            <dd>{won(result.plan.fixedAmount)}</dd>
          </div>
          <div>
            <dt>생활비 계획</dt>
            <dd>{won(result.plan.livingAmount)}</dd>
          </div>
          <div>
            <dt>예비비 계획</dt>
            <dd>{won(result.plan.reserveAmount)}</dd>
          </div>
        </dl>
      )}
      <h4>조회 월의 기록된 수입·소비</h4>
      <dl className="ledger-budget-breakdown">
        <div>
          <dt>수입</dt>
          <dd>{won(income)}</dd>
        </div>
        <div>
          <dt>지출</dt>
          <dd>{won(expenses)}</dd>
        </div>
        <div>
          <dt>환불</dt>
          <dd>{won(refunds)}</dd>
        </div>
        <div>
          <dt>순소비 (지출 − 환불)</dt>
          <dd>{won(expenses - refunds)}</dd>
        </div>
        <div>
          <dt>수입 − 순소비</dt>
          <dd>{won(income - expenses + refunds)}</dd>
        </div>
      </dl>
      <p className="ledger-note">
        전체 계좌에 기록한 내역만 합산합니다. 이체·잔액 조정은 제외하며, 환불은
        받은 날짜에 반영합니다. 기록 누락은 알 수 없으며 수입과 소비의 차이는
        현재 잔액이나 실제 저축액이 아닙니다.
      </p>
      <dl className="ledger-budget-breakdown">
        <div>
          <dt>월 저축·투자 계획 합계</dt>
          <dd>
            {result.total.planned === null
              ? "계획 없음"
              : won(result.total.planned)}
          </dd>
        </div>
        <div>
          <dt>
            기록된 순이체{" "}
            {result.total.unpaired || result.total.partial ? "(잠정)" : "실적"}
          </dt>
          <dd>{won(result.total.net)}</dd>
        </div>
        <div>
          <dt>합계 기준 부족액</dt>
          <dd>
            {result.total.remaining === null
              ? "내역 확인 필요"
              : won(result.total.remaining)}
          </dd>
        </div>
      </dl>
      {result.total.unpaired > 0 && (
        <p className="ledger-error">
          상대 거래와 연결되지 않은 이체가 {result.total.unpaired}건 있습니다.
          파일로 가져온 한쪽 기록만으로는 저축계좌 사이 이동을 구분할 수 없어
          부족액을 확정하지 않습니다.
        </p>
      )}
      {result.total.partial && (
        <p className="ledger-note">
          삭제된 계좌 또는 월 중간 이후부터 기록하는 계좌가 있어 월 전체
          부족액은 계산하지 않습니다.
        </p>
      )}
      <div className="ledger-stack">
        {result.accountRows.map((row) => (
          <article key={row.account.id} className="ledger-funding-goal">
            <h4>{row.account.name}</h4>
            <dl className="ledger-budget-breakdown">
              <div>
                <dt>월 계획</dt>
                <dd>{row.planned === null ? "계획 없음" : won(row.planned)}</dd>
              </div>
              <div>
                <dt>기록된 계좌 순이체</dt>
                <dd>{won(row.net)}</dd>
              </div>
              <div>
                <dt>계획까지 남은 금액</dt>
                <dd>
                  {row.remaining === null
                    ? "내역 확인 필요"
                    : won(row.remaining)}
                </dd>
              </div>
            </dl>
            {row.unpaired > 0 && (
              <p className="ledger-note">
                연결되지 않은 이체 {row.unpaired}건 · 잠정 실적
              </p>
            )}
            {row.partial && (
              <p className="ledger-note">
                기준일 {row.account.openingDate} · 월 전체 기록이 아닙니다.
              </p>
            )}
          </article>
        ))}
      </div>
      {!!result.goalRows.length && (
        <>
          <h4>목표별 조회 월 실적</h4>
          <div className="ledger-stack">
            {result.goalRows.map((row) => (
              <article key={row.goal.id} className="ledger-funding-goal">
                <h4>{row.goal.name}</h4>
                {!row.supported ? (
                  <p className="ledger-note">
                    저축·청약·ISA·연금 계좌만 연결한 목표의 납입 실적을
                    비교합니다.
                  </p>
                ) : (
                  <dl className="ledger-budget-breakdown">
                    <div>
                      <dt>월 계획</dt>
                      <dd>
                        {row.planned === null ? "계획 없음" : won(row.planned)}
                      </dd>
                    </div>
                    <div>
                      <dt>연결 계좌 순이체</dt>
                      <dd>{won(row.net)}</dd>
                    </div>
                    <div>
                      <dt>목표별 부족액</dt>
                      <dd>
                        {row.remaining === null
                          ? "내역 확인 필요"
                          : won(row.remaining)}
                      </dd>
                    </div>
                  </dl>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <p className="ledger-note">
        입금에서 출금을 뺀 계좌 이동만 집계합니다. 기준
        잔액·급여·이자·평가손익은 납입 실적에 더하지 않아요. 저축계좌 간 이동은
        전체 합계에서 상쇄되지만 계좌별·목표별 실적은 달라질 수 있습니다. 다른
        계좌의 초과 납입이 목표별 부족액을 자동으로 메우지는 않습니다.
      </p>
      <p className="ledger-note">
        가져오지 않은 거래는 포함되지 않습니다. 상대 계좌의 파일 이체를 자동으로
        연결하는 기능은 아직 없으며, 이미 가져온 이체를 직접 입력으로 다시
        추가하면 중복 기록됩니다.
      </p>
    </section>
  );
}
