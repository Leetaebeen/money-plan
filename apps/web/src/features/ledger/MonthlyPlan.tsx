import { useState } from "react";
import {
  money,
  roles,
  savingRoles,
  validateMonthlyPlan,
  won,
  type MonthlyPlan as Plan,
} from "./model";
import { monthlyMetrics } from "./monthly-plan";
import { SavingsActuals } from "./SavingsActuals";
import { captureMonthlyPlan } from "./plan-history";
import { CycleBudget } from "./CycleBudget";
import { ScheduledPayments } from "./ScheduledPayments";
import { Empty, type PanelProps } from "./shared";

type Props = PanelProps & { onGoals: () => void; onAccounts: () => void };

export function MonthlyPlan({
  data,
  busy,
  change,
  onGoals,
  onAccounts,
}: Props) {
  const [editing, setEditing] = useState(!data.monthlyPlan);
  const [draft, setDraft] = useState(() => draftFrom(data));
  const [error, setError] = useState("");
  const plan = data.monthlyPlan;
  const result = monthlyMetrics(data);
  const savingAccounts = data.accounts.filter((a) =>
    savingRoles.includes(a.role),
  );
  function edit() {
    setDraft(draftFrom(data));
    setEditing(true);
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const next: Plan = {
        salaryAccountId: draft.salaryAccountId,
        payday: Number(draft.payday),
        netIncome: money(draft.netIncome),
        fixedAccountId: draft.fixedAccountId || null,
        fixedAmount: money(draft.fixedAmount),
        livingAccountId: draft.livingAccountId || null,
        livingAmount: money(draft.livingAmount),
        reserveAmount: money(draft.reserveAmount),
        allocations: savingAccounts
          .map((a) => ({
            accountId: a.id,
            amount: money(draft.allocations[a.id]?.trim() || "0"),
          }))
          .filter((a) => a.amount > 0),
      };
      validateMonthlyPlan(next, data.accounts);
      if (
        await change((ledger) => {
          ledger.monthlyPlan = next;
          captureMonthlyPlan(ledger);
        }, "월급 계획과 이번 달 이력을 저장했어요. 실제 거래와 잔액은 그대로예요.")
      )
        setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    }
  }
  const accountOptions = (
    <>
      {data.accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </>
  );
  if (!data.accounts.length)
    return (
      <>
        <Empty>
          <p>월급 계획에 사용할 계좌부터 등록해 주세요.</p>
          <button className="ledger-btn" onClick={onAccounts}>
            계좌 등록
          </button>
        </Empty>
        <SavingsActuals data={data} busy={busy} change={change} />
      </>
    );
  return (
    <section className="ledger-salary">
      <div className="ledger-section-title">
        <div>
          <h2>월급에 할 일을 정해요</h2>
          <p>쓸 돈과 모을 돈을 나누고, 목표까지 이어지는 계획</p>
        </div>
        {plan && !editing && (
          <button className="ledger-btn" disabled={busy} onClick={edit}>
            계획 수정
          </button>
        )}
      </div>
      <ScheduledPayments data={data} busy={busy} change={change} />
      {editing && (
        <form className="ledger-panel ledger-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <h3>1. 월급과 매달 쓸 돈</h3>
            <p className="ledger-note">
              금액이 없으면 0을 입력하세요. 고정비에는 대출 상환 등 매달 꼭
              나가는 돈을 포함하고, 생활비와 중복해서 넣지 마세요.
            </p>
            <div className="ledger-fields">
              <label>
                월 실수령액 (원)
                <input
                  required
                  inputMode="numeric"
                  value={draft.netIncome}
                  onChange={(e) =>
                    setDraft({ ...draft, netIncome: e.target.value })
                  }
                  placeholder="세후 월급"
                />
              </label>
              <label>
                월급 받는 계좌
                <select
                  required
                  value={draft.salaryAccountId}
                  onChange={(e) =>
                    setDraft({ ...draft, salaryAccountId: e.target.value })
                  }
                >
                  <option value="">선택하세요</option>
                  {accountOptions}
                </select>
              </label>
              <label>
                매월 월급날
                <select
                  required
                  value={draft.payday}
                  onChange={(e) =>
                    setDraft({ ...draft, payday: e.target.value })
                  }
                >
                  <option value="">선택하세요</option>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
              </label>
              <label>
                월 고정비 (원)
                <input
                  required
                  inputMode="numeric"
                  value={draft.fixedAmount}
                  onChange={(e) =>
                    setDraft({ ...draft, fixedAmount: e.target.value })
                  }
                />
              </label>
              <label>
                고정비 보관 계좌
                <select
                  value={draft.fixedAccountId}
                  onChange={(e) =>
                    setDraft({ ...draft, fixedAccountId: e.target.value })
                  }
                >
                  <option value="">미사용 (고정비 0원)</option>
                  {accountOptions}
                </select>
              </label>
              <label>
                월 생활비 예산 (원)
                <input
                  required
                  inputMode="numeric"
                  value={draft.livingAmount}
                  onChange={(e) =>
                    setDraft({ ...draft, livingAmount: e.target.value })
                  }
                />
              </label>
              <label>
                생활비 보관 계좌
                <select
                  value={draft.livingAccountId}
                  onChange={(e) =>
                    setDraft({ ...draft, livingAccountId: e.target.value })
                  }
                >
                  <option value="">미사용 (생활비 0원)</option>
                  {accountOptions}
                </select>
              </label>
              <label>
                매달 남길 비상 예비비 (원)
                <input
                  required
                  inputMode="numeric"
                  value={draft.reserveAmount}
                  onChange={(e) =>
                    setDraft({ ...draft, reserveAmount: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="ledger-note">
              비상 예비비는 이번 월급에서 따로 남겨둘 돈이며, 이미 모은 비상금
              잔액이 아닙니다. 월급계좌에 보관하는 것으로 계산해요.
            </p>
            <h3>2. 계좌별 저축·투자 계획</h3>
            <p className="ledger-note">
              직접 정한 납입액을 입력하세요. 비워두거나 0을 입력하면 배분하지
              않습니다. 적금·청약·ISA·연금의 납입 조건과 한도는 별도로 확인해
              주세요.
            </p>
            <div className="ledger-fields">
              {savingAccounts.map((account) => (
                <label key={account.id}>
                  {account.name} 월 배분액 (원)
                  <input
                    inputMode="numeric"
                    value={draft.allocations[account.id] ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        allocations: {
                          ...draft.allocations,
                          [account.id]: e.target.value,
                        },
                      })
                    }
                    placeholder="미배정"
                  />
                  <small>{roles[account.role]}</small>
                </label>
              ))}
            </div>
            {!savingAccounts.length && (
              <p className="ledger-note">
                자산 화면에서 적금·청약·ISA·연금저축 역할의 계좌를 추가하면
                배분할 수 있어요.
              </p>
            )}
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">
                저장하고 배분표 보기
              </button>
              {plan && (
                <button
                  type="button"
                  className="ledger-btn"
                  onClick={() => setEditing(false)}
                >
                  취소
                </button>
              )}
            </div>
          </fieldset>
        </form>
      )}
      <SavingsActuals data={data} busy={busy} change={change} />
      {plan && result && (
        <>
          <CycleBudget data={data} />
          {editing && (
            <p className="ledger-note">
              아래는 마지막으로 저장한 계획입니다. 수정 내용은 저장 후 반영돼요.
            </p>
          )}
          <section
            className="ledger-panel ledger-salary-summary"
            aria-label="월급 배분 요약"
          >
            <span className="ledger-eyebrow">월 실수령액</span>
            <p className="ledger-amount">{won(plan.netIncome)}</p>
            <p className="ledger-note">
              매월 {plan.payday}일 · 다음 예정일 {result.cycle.next}
              <br />
              해당 날짜가 없는 달은 말일 기준이며, 주말·공휴일 조정은 반영하지
              않아요.
            </p>
            <dl className="ledger-budget-breakdown">
              <div>
                <dt>고정비</dt>
                <dd>− {won(plan.fixedAmount)}</dd>
              </div>
              <div>
                <dt>생활비</dt>
                <dd>− {won(plan.livingAmount)}</dd>
              </div>
              <div>
                <dt>비상 예비비</dt>
                <dd>− {won(plan.reserveAmount)}</dd>
              </div>
              <div className="ledger-budget-subtotal">
                <dt>저축·투자에 배분할 수 있는 돈</dt>
                <dd>{won(result.capacity)}</dd>
              </div>
              <div>
                <dt>정해둔 저축·투자</dt>
                <dd>− {won(result.savings)}</dd>
              </div>
              <div className="ledger-budget-subtotal">
                <dt>
                  {result.deficit
                    ? "현재 계획의 월 부족액"
                    : "아직 배정하지 않은 돈"}
                </dt>
                <dd>{won(result.deficit || result.unassigned)}</dd>
              </div>
            </dl>
            {result.deficit > 0 ? (
              <p className="ledger-error" role="status">
                월급보다 {won(result.deficit)} 더 배정했어요. 지출이나 납입액을
                줄여야 실행할 수 있는 계획입니다.
              </p>
            ) : (
              <p className="ledger-notice">
                {result.unassigned
                  ? `${won(result.unassigned)}의 용도를 더 정할 수 있어요.`
                  : "이번 월급의 용도를 모두 정했어요."}{" "}
                실제로 지금 쓸 수 있는 계좌 잔액을 뜻하지는 않습니다.
              </p>
            )}
          </section>
          <section className="ledger-panel">
            <h3>
              {result.deficit
                ? "조정이 필요한 계좌별 배분 초안"
                : "매달 계좌별 배분표"}
            </h3>
            <p className="ledger-note">
              출발 계좌:{" "}
              {data.accounts.find((a) => a.id === plan.salaryAccountId)?.name}.
              기존 잔액을 차감하지 않고, 새 월급 한 번의 용도만 나눈 표입니다.
            </p>
            <div className="ledger-salary-routes">
              {result.routes.map((route) => (
                <article key={route.accountId} className="ledger-salary-route">
                  <div>
                    <span className="ledger-tag">
                      {route.transfer ? "옮길 계획" : "월급계좌에 보관"}
                    </span>
                    <h4>
                      {
                        data.accounts.find((a) => a.id === route.accountId)
                          ?.name
                      }
                    </h4>
                    <p className="ledger-note">{route.purposes.join(" · ")}</p>
                  </div>
                  <strong>{won(route.amount)}</strong>
                </article>
              ))}
            </div>
            {!result.routes.length && <p>배정한 금액이 없습니다.</p>}
            <p className="ledger-note">
              자동 이체나 거래 기록은 생성하지 않습니다. 실제로 옮긴 뒤 거래를
              입력하거나 파일을 가져오세요.
            </p>
          </section>
          <section className="ledger-panel">
            <div className="ledger-section-title">
              <div>
                <h3>이 배분으로 목표에 닿을까요?</h3>
                <p>연결 계좌의 월 배분액으로 목표 도달일을 다시 계산해요.</p>
              </div>
              <button className="ledger-text-btn" onClick={onGoals}>
                목표 관리 →
              </button>
            </div>
            {!result.goals.length ? (
              <p>
                목표 금액과 날짜를 정하면 필요한 월 적립액과 비교할 수 있어요.
              </p>
            ) : (
              <>
                <div className="ledger-stack">
                  {result.goals.map(({ goal, metrics, status }) => (
                    <article className="ledger-funding-goal" key={goal.id}>
                      <h4>{goal.name}</h4>
                      {status === "spending" ? (
                        <p>
                          월급·지출용 계좌가 연결돼 있어 앞으로 쓸 돈이 섞여
                          있습니다. 목표용 계좌를 분리한 뒤 비교해 주세요.
                        </p>
                      ) : !metrics ? (
                        <p>
                          연결 계좌의 잔액을 먼저 등록해 주세요. 모르는 금액은
                          0원으로 계산하지 않아요.
                        </p>
                      ) : (
                        <>
                          <dl className="ledger-budget-breakdown">
                            <div>
                              <dt>목표 날짜</dt>
                              <dd>{goal.deadline}</dd>
                            </div>
                            <div>
                              <dt>필요한 월 적립액</dt>
                              <dd>
                                {metrics.needed === null
                                  ? "남은 납입일 없음"
                                  : won(metrics.needed)}
                              </dd>
                            </div>
                            <div>
                              <dt>연결 계좌의 월 배분</dt>
                              <dd>{won(metrics.monthly)}</dd>
                            </div>
                            <div>
                              <dt>추가로 필요한 월 배분</dt>
                              <dd>
                                {metrics.gap === null
                                  ? "목표일 조정 필요"
                                  : won(metrics.gap)}
                              </dd>
                            </div>
                            <div>
                              <dt>이 배분을 유지할 때 도달일</dt>
                              <dd>
                                {metrics.remaining === 0
                                  ? "목표 달성"
                                  : (metrics.projected ?? "계산 불가")}
                              </dd>
                            </div>
                          </dl>
                          <p className="ledger-note">
                            {status === "achieved"
                              ? "현재 등록 잔액이 목표 금액에 도달했어요."
                              : status === "overdue"
                                ? "목표일까지 남은 납입일이 없어요. 목표 날짜를 조정해 주세요."
                                : status === "shortfall"
                                  ? metrics.projected
                                    ? `매달 ${won(metrics.gap!)}를 더 배분하거나, 위 도달일까지 목표 날짜를 늦추는 방법을 비교해 보세요.`
                                    : `매달 ${won(metrics.gap!)}의 추가 배분이 필요해요. 월 배분액을 정한 뒤 도달일을 다시 확인해 주세요.`
                                  : "배분한 금액은 목표에 필요한 월 적립액을 충족합니다."}
                          </p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
                {result.goalGap === null ? (
                  <p className="ledger-note">
                    잔액·연결 계좌·목표일을 확인해야 하는 목표가 있어 전체
                    부족액은 아직 계산하지 않습니다.
                  </p>
                ) : (
                  <p className="ledger-notice">
                    목표별로 더 필요한 월 배분은 총 {won(result.goalGap)}입니다.
                    미배정액을 활용하고 현재 계획의 적자까지 해소하려면 매달{" "}
                    {won(result.additionalIncome!)}를 추가로 확보하거나
                    지출·배분을 조정해야 해요.
                  </p>
                )}
                {result.deficit > 0 && (
                  <p className="ledger-error">
                    전체 예산이 부족하므로 위 도달일은 배분액을 실제로 마련할 수
                    있을 때의 가정입니다.
                  </p>
                )}
              </>
            )}
            <p className="ledger-note">
              수익률 0%, 오늘 이후의 목표별 납입일 기준입니다. 향후
              인출·세금·수수료·투자 손익은 반영하지 않습니다. 저축·투자는 지출용
              계좌와 분리해 관리해 주세요.
            </p>
          </section>
          <button
            className="ledger-text-btn"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "월급 계획만 삭제할까요? 계좌와 거래는 유지되며 목표 계산은 목표에 직접 입력했던 월 적립액으로 돌아갑니다.",
                )
              )
                void change((ledger) => {
                  ledger.monthlyPlan = null;
                }, "월급 계획을 삭제했어요.").then((ok) => {
                  if (ok) {
                    setEditing(true);
                    setDraft(draftFrom({ ...data, monthlyPlan: null }));
                  }
                });
            }}
          >
            월급 계획 삭제
          </button>
        </>
      )}
    </section>
  );
}

function draftFrom(data: PanelProps["data"]) {
  const plan = data.monthlyPlan;
  return {
    salaryAccountId:
      plan?.salaryAccountId ??
      data.accounts.find((a) => a.role === "SALARY")?.id ??
      "",
    payday: plan ? String(plan.payday) : "",
    netIncome: plan ? String(plan.netIncome) : "",
    fixedAccountId: plan
      ? (plan.fixedAccountId ?? "")
      : (data.accounts.find((a) => a.role === "FIXED")?.id ?? ""),
    fixedAmount: plan ? String(plan.fixedAmount) : "",
    livingAccountId: plan
      ? (plan.livingAccountId ?? "")
      : (data.accounts.find((a) => a.role === "LIVING")?.id ?? ""),
    livingAmount: plan ? String(plan.livingAmount) : "",
    reserveAmount: plan ? String(plan.reserveAmount) : "",
    allocations: Object.fromEntries(
      plan?.allocations.map((a) => [a.accountId, String(a.amount)]) ?? [],
    ) as Record<string, string>,
  };
}
