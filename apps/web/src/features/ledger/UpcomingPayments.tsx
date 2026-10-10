import type { ScheduleView } from "./schedules";
import { won, type Ledger } from "./model";
import { upcomingPayments } from "./upcoming-payments";

export function UpcomingPayments({
  data,
  onPlan,
}: {
  data: Ledger;
  onPlan: (view?: ScheduleView) => void;
}) {
  const result = upcomingPayments(data);
  return (
    <section className="ledger-panel" aria-label="다가오는 납부 일정">
      <div className="ledger-section-title">
        <h3>앞으로 30일, 납부할 돈</h3>
        <button
          className="ledger-text-btn"
          onClick={() => onPlan({ month: result.asOf.slice(0, 7) })}
        >
          일정 확인 →
        </button>
      </div>
      <p>
        {result.asOf} ~ {result.end} · 거래 미연결 예정액{" "}
        <strong>{won(result.total)}</strong>
      </p>
      {!!result.overdue.length && (
        <p className="ledger-note">
          이번 달 예정일이 지난 거래 미연결 일정 {result.overdue.length}건이
          별도로 있습니다. 실제 납부 여부를 확인하세요.
          <button
            className="ledger-text-btn"
            onClick={() => onPlan({ month: result.asOf.slice(0, 7) })}
          >
            지난 예정일 확인 →
          </button>
        </p>
      )}
      {!result.rows.length ? (
        <p className="ledger-note">
          이 기간에 등록된 미연결 납부 일정이 없습니다.
        </p>
      ) : (
        <>
          <div className="ledger-stack">
            {result.accounts.map((row) => (
              <article className="ledger-funding-goal" key={row.account.id}>
                <h4>{row.account.name}</h4>
                <p>
                  예정액 {won(row.required)} · 비교 잔액{" "}
                  {row.current === null ? "확인 필요" : won(row.current)}
                </p>
                <p>
                  {row.shortfall === null
                    ? "사용 가능한 잔액을 직접 확인해 주세요."
                    : row.shortfall > 0
                      ? `등록 잔액보다 ${won(row.shortfall)} 부족해요.`
                      : "등록 잔액이 예정액 이상이에요."}
                </p>
              </article>
            ))}
          </div>
          <details>
            <summary>납부 일정 {result.rows.length}건 보기</summary>
            {result.rows.map((row) => (
              <p key={`${row.schedule.id}:${row.dueDate}`}>
                <button
                  className="ledger-text-btn"
                  onClick={() =>
                    onPlan({
                      month: row.dueDate.slice(0, 7),
                      accountId: row.schedule.accountId,
                      ...(data.accounts.find(
                        (a) => a.id === row.schedule.targetAccountId,
                      )?.role === "CREDIT_CARD"
                        ? { cardId: row.schedule.targetAccountId! }
                        : {}),
                    })
                  }
                >
                  {row.dueDate} · {row.schedule.name} ·{" "}
                  {won(row.schedule.amount)} →
                </button>
              </p>
            ))}
          </details>
        </>
      )}
      <p className="ledger-note">
        예정 입금·월급·계좌 이동의 유입과 미등록 지출은 반영하지 않은
        비교입니다. 잔액을 모르는 계좌나 적금·투자·카드는 현금으로 가정하지
        않습니다. 이미 납부한 거래는 일정에 연결해야 중복으로 준비하지 않아요.
        지난달 이전의 미연결 일정은 월별 일정에서 확인하세요.
      </p>
    </section>
  );
}
