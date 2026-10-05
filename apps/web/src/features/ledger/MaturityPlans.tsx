import { useState } from "react";
import { money, today, won, type MaturityPlan } from "./model";
import { maturityMetrics } from "./maturities";
import type { PanelProps } from "./shared";

export function MaturityPlans({ data, busy, change }: PanelProps) {
  const [editing, setEditing] = useState<MaturityPlan | null>(null);
  const [accountId, setAccount] = useState("");
  const [date, setDate] = useState("");
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const savings = data.accounts.filter((a) => a.role === "SAVINGS");
  function edit(plan?: MaturityPlan) {
    const next = plan ?? {
      id: crypto.randomUUID(),
      accountId: savings[0]?.id ?? "",
      date: "",
      expectedAmount: null,
      allocations: [],
      note: "",
      receivedDate: null,
    };
    setEditing(next);
    setAccount(next.accountId);
    setDate(next.date);
    setExpected(
      next.expectedAmount === null ? "" : String(next.expectedAmount),
    );
    setAllocations(
      Object.fromEntries(
        next.allocations.map((a) => [a.accountId, String(a.amount)]),
      ),
    );
    setNote(next.note);
    setError("");
  }
  return (
    <section className="ledger-panel" aria-label="적금 만기 자금 계획">
      <div className="ledger-section-title">
        <h3>적금 만기와 다음 용도</h3>
        <button
          className="ledger-btn"
          disabled={busy || !savings.length}
          onClick={() => edit()}
        >
          만기 계획 추가
        </button>
      </div>
      {!savings.length && (
        <p className="ledger-note">적금·저축 역할의 계좌를 먼저 등록하세요.</p>
      )}
      <p className="ledger-note">
        만기에 받을 금액과 이후 옮길 곳을 계획합니다. 예상 금액은 현재 자산·목표
        잔액에 더하지 않습니다.
      </p>
      {editing && (
        <form
          className="ledger-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              const next: MaturityPlan = {
                ...editing,
                accountId,
                date,
                expectedAmount: expected.trim() ? money(expected) : null,
                note: note.trim(),
                allocations: data.accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => ({
                    accountId: a.id,
                    amount: money(allocations[a.id]?.trim() || "0"),
                  }))
                  .filter((a) => a.amount > 0),
              };
              if (
                await change((ledger) => {
                  const index = ledger.maturities.findIndex(
                    (m) => m.id === next.id,
                  );
                  if (index < 0) ledger.maturities.push(next);
                  else ledger.maturities[index] = next;
                }, "만기 계획을 저장했어요. 실제 잔액은 그대로예요.")
              )
                setEditing(null);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "만기 계획을 확인해 주세요.",
              );
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                만기 계좌
                <select
                  required
                  value={accountId}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  {savings.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                만기일
                <input
                  type="date"
                  required
                  min="2000-01-01"
                  max="2099-12-31"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                예상 세후 총수령액 (원, 선택)
                <input
                  inputMode="numeric"
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  placeholder="은행에서 확인한 금액, 모르면 비워두세요"
                />
              </label>
              <label>
                메모
                <input
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="재예치·목표 자금 등"
                />
              </label>
            </div>
            <p className="ledger-note">
              총수령액은 원금과 세후 이자를 합친 금액입니다. 금리·세금을 자동
              계산하지 않습니다. 배분하지 않은 금액은 미배정으로 남습니다.
            </p>
            <h4>만기 자금을 옮길 계좌별 계획</h4>
            <div className="ledger-fields">
              {data.accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <label key={a.id}>
                    {a.name} (원)
                    <input
                      inputMode="numeric"
                      value={allocations[a.id] ?? ""}
                      placeholder="미배정"
                      onChange={(e) =>
                        setAllocations({
                          ...allocations,
                          [a.id]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
            </div>
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">계획 저장</button>
              <button
                className="ledger-btn"
                type="button"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {!data.maturities.length && !editing && (
        <p className="ledger-note">등록된 만기 계획이 없습니다.</p>
      )}
      <div className="ledger-stack">
        {[...data.maturities]
          .sort(
            (a, b) =>
              Number(!!a.receivedDate) - Number(!!b.receivedDate) ||
              a.date.localeCompare(b.date),
          )
          .map((plan) => {
            const metrics = maturityMetrics(plan, data);
            return (
              <article className="ledger-funding-goal" key={plan.id}>
                <h4>
                  {data.accounts.find((a) => a.id === plan.accountId)?.name} ·{" "}
                  {plan.date} 만기
                </h4>
                <p>
                  {metrics.status === "received"
                    ? `수령 확인: ${plan.receivedDate}`
                    : metrics.status === "overdue"
                      ? "만기일 지남 · 수령 여부 확인 필요"
                      : metrics.status === "today"
                        ? "오늘 만기"
                        : `${metrics.daysLeft}일 남음${metrics.status === "soon" ? " · 30일 이내 만기" : ""}`}
                </p>
                <dl className="ledger-budget-breakdown">
                  <div>
                    <dt>예상 세후 총수령액</dt>
                    <dd>
                      {plan.expectedAmount === null
                        ? "미등록"
                        : won(plan.expectedAmount)}
                    </dd>
                  </div>
                  <div>
                    <dt>배분 계획 합계</dt>
                    <dd>{won(metrics.allocated)}</dd>
                  </div>
                  <div>
                    <dt>
                      {metrics.remaining !== null && metrics.remaining < 0
                        ? "예상액 대비 초과 배분"
                        : "미배정 예상액"}
                    </dt>
                    <dd>
                      {metrics.remaining === null
                        ? "예상 수령액 확인 필요"
                        : won(Math.abs(metrics.remaining))}
                    </dd>
                  </div>
                </dl>
                {plan.allocations.length > 0 && (
                  <ul>
                    {plan.allocations.map((a) => (
                      <li key={a.accountId}>
                        {
                          data.accounts.find(
                            (account) => account.id === a.accountId,
                          )?.name
                        }
                        : {won(a.amount)}
                      </li>
                    ))}
                  </ul>
                )}
                {plan.note && <p className="ledger-note">{plan.note}</p>}
                {metrics.remaining !== null && metrics.remaining < 0 && (
                  <p className="ledger-error">
                    예상 수령액보다 많이 배분했습니다. 실제로 옮기기 전에 계획을
                    조정하세요.
                  </p>
                )}
                {(metrics.continuingSchedules.length > 0 ||
                  metrics.monthlyAllocation > 0) && (
                  <p className="ledger-note">
                    이 계좌에 월급 배분 {won(metrics.monthlyAllocation)}, 만기
                    이후까지 설정된 납부 일정{" "}
                    {metrics.continuingSchedules.length}개가 있습니다. 만기
                    후에는 월급 화면에서 배분액과 반복 일정을 확인하세요.
                  </p>
                )}
                <div className="ledger-actions">
                  <button
                    className="ledger-text-btn"
                    disabled={busy}
                    onClick={() => edit(plan)}
                  >
                    계획 수정
                  </button>
                  <button
                    className="ledger-text-btn"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "이 만기 계획을 삭제할까요? 계좌와 실제 거래는 유지됩니다.",
                        )
                      )
                        void change((ledger) => {
                          ledger.maturities = ledger.maturities.filter(
                            (m) => m.id !== plan.id,
                          );
                        }, "만기 계획을 삭제했어요.");
                    }}
                  >
                    계획 삭제
                  </button>
                </div>
                {plan.receivedDate ? (
                  <button
                    className="ledger-text-btn"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "수령 확인 표시를 취소할까요? 실제 거래는 그대로 유지됩니다.",
                        )
                      )
                        void change((ledger) => {
                          ledger.maturities.find(
                            (m) => m.id === plan.id,
                          )!.receivedDate = null;
                        }, "수령 확인 표시를 취소했어요.");
                    }}
                  >
                    수령 확인 취소
                  </button>
                ) : (
                  plan.date <= today() && (
                    <form
                      className="ledger-form"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        const receivedDate = String(
                          new FormData(event.currentTarget).get(
                            "receivedDate",
                          ) ?? "",
                        );
                        await change((ledger) => {
                          ledger.maturities.find(
                            (m) => m.id === plan.id,
                          )!.receivedDate = receivedDate;
                        }, "수령 확인 표시를 저장했어요. 실제 거래는 별도로 기록해 주세요.");
                      }}
                    >
                      <fieldset disabled={busy}>
                        <label className="ledger-actual-month">
                          실제로 수령한 날짜
                          <input
                            name="receivedDate"
                            type="date"
                            required
                            min={plan.date}
                            max={today()}
                            defaultValue={today()}
                          />
                        </label>
                        <button className="ledger-btn">수령 확인 표시</button>
                      </fieldset>
                    </form>
                  )
                )}
              </article>
            );
          })}
      </div>
      <p className="ledger-note">
        수령 확인은 직접 표시하는 상태이며 거래를 생성하지 않습니다. 실제 수령은
        거래 화면에서 원금 이동과 이자 수입을 구분해 기록하세요. 기존 거래를
        중복 입력하지 마세요.
      </p>
    </section>
  );
}
