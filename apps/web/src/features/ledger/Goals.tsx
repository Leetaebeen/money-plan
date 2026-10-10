import { useState } from "react";
import {
  isLiability,
  goalMetrics,
  goalMonthly,
  goalUsesSpendingAccount,
  planRemainder,
  money,
  today,
  won,
  type Goal,
} from "./model";
import { Empty, type PanelProps } from "./shared";
import { GoalScenario } from "./GoalScenario";
export function GoalCard({
  goal,
  data,
}: {
  goal: Goal;
  data: PanelProps["data"];
}) {
  const metrics = goalMetrics(goal, data);
  return (
    <>
      <div className="ledger-row">
        <h3>{goal.name}</h3>
        <span className="ledger-tag">{goal.deadline}</span>
      </div>
      <p className="ledger-amount">
        {metrics ? won(metrics.saved) : "연결 계좌 잔액을 등록해 주세요"}
        <span className="ledger-note"> / {won(goal.target)}</span>
      </p>
      {metrics && (
        <>
          <progress
            max={goal.target}
            value={Math.max(0, Math.min(metrics.saved, goal.target))}
            aria-label={`${goal.name} 달성률`}
          />
          <div className="ledger-goal-stats">
            <div>
              <span>매달 필요한 돈</span>
              <b>
                {metrics.needed === null
                  ? "남은 납입일 없음"
                  : won(metrics.needed)}
              </b>
            </div>
            <div>
              <span>계획 대비 월 부족액</span>
              <b>
                {metrics.gap === null ? "목표일 조정 필요" : won(metrics.gap)}
              </b>
            </div>
            <div>
              <span>현재 계획의 도달일</span>
              <b>
                {metrics.remaining === 0
                  ? "목표 달성"
                  : (metrics.projected ?? "현재 계획으로 계산 불가")}
              </b>
            </div>
          </div>
        </>
      )}
      <p className="ledger-note">
        월 {won(goalMonthly(goal, data))} · 매월 {goal.paymentDay}일 · 수익률 0%
        가정
        {data.monthlyPlan && " · 월급 배분표 기준"}
      </p>
      {data.monthlyPlan && planRemainder(data.monthlyPlan) < 0 && (
        <p className="ledger-error">
          월급 배분 총액이 예산을 초과합니다. 위 도달일은 필요한 배분액을
          마련했을 때의 가정이에요.
        </p>
      )}
      {data.monthlyPlan && goalUsesSpendingAccount(goal, data.monthlyPlan) && (
        <p className="ledger-note">
          월급·지출용 계좌가 목표에 포함돼 있어 앞으로 쓸 돈이 섞여 있습니다.
          목표용 계좌를 분리해 주세요.
        </p>
      )}
    </>
  );
}
export function Goals({ data, busy, change }: PanelProps) {
  const [editing, setEditing] = useState<Goal | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [monthly, setMonthly] = useState("");
  const [deadline, setDeadline] = useState("");
  const [day, setDay] = useState("25");
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  function edit(goal: Goal) {
    setEditing(goal);
    setName(goal.name);
    setTarget(goal.target ? String(goal.target) : "");
    setMonthly(String(goal.monthly));
    setDeadline(goal.deadline);
    setDay(String(goal.paymentDay));
    setIds(goal.accountIds);
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!editing) return;
      const goal = {
        ...editing,
        name: name.trim(),
        target: money(target),
        monthly: money(monthly),
        deadline,
        paymentDay: Number(day),
        accountIds: ids,
      };
      if (
        await change((next) => {
          const index = next.goals.findIndex((g) => g.id === goal.id);
          if (index < 0) next.goals.push(goal);
          else next.goals[index] = goal;
        }, "목표를 저장했어요.")
      )
        setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    }
  }
  return (
    <section>
      <div className="ledger-section-title">
        <div>
          <h2>모으는 이유를 정해요</h2>
          <p>목표에 필요한 돈부터 역산합니다.</p>
        </div>
        <button
          className="ledger-btn"
          disabled={busy || !data.accounts.length}
          onClick={() =>
            edit({
              id: crypto.randomUUID(),
              name: "",
              target: 0,
              deadline: "",
              monthly: 0,
              paymentDay: 25,
              accountIds: [],
            })
          }
        >
          + 목표 만들기
        </button>
      </div>
      {editing && (
        <form onSubmit={save} className="ledger-panel ledger-form">
          <h3>목표 설정</h3>
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                목표 이름
                <input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 내 집 자금"
                />
              </label>
              <label>
                목표 금액 (원)
                <input
                  required
                  inputMode="numeric"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <label>
                목표 날짜
                <input
                  type="date"
                  required
                  min={today()}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
              <label>
                매달 모을 금액 (원)
                <input
                  required
                  inputMode="numeric"
                  readOnly={!!data.monthlyPlan}
                  value={
                    data.monthlyPlan
                      ? goalMonthly({ ...editing, accountIds: ids }, data)
                      : monthly
                  }
                  onChange={(e) => setMonthly(e.target.value)}
                />
              </label>
              <label>
                매월 납입 예정일
                <select value={day} onChange={(e) => setDay(e.target.value)}>
                  {Array.from({ length: 28 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="ledger-checks">
              <legend>목표에 연결할 계좌</legend>
              {data.accounts
                .filter((a) => !isLiability(a))
                .map((a) => {
                  const used = data.goals.some(
                    (g) => g.id !== editing.id && g.accountIds.includes(a.id),
                  );
                  return (
                    <label key={a.id}>
                      <input
                        type="checkbox"
                        checked={ids.includes(a.id)}
                        disabled={used}
                        onChange={(e) =>
                          setIds(
                            e.target.checked
                              ? [...ids, a.id]
                              : ids.filter((id) => id !== a.id),
                          )
                        }
                      />
                      {a.name}
                      {used && " · 다른 목표에 연결됨"}
                    </label>
                  );
                })}
            </fieldset>
            <p className="ledger-note">
              {data.monthlyPlan &&
                "월 적립액은 월급 화면에서 연결 계좌에 배분한 금액을 사용합니다. "}
              선택한 계좌의 전체 잔액을 이 목표에 연결합니다. 같은 돈은 두
              목표에 중복 배정하지 않아요. 오늘 이후의 납입일부터 계산하며,
              예정액은 실제 잔액에 더하지 않습니다.
            </p>
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">목표 저장</button>
              <button
                type="button"
                className="ledger-btn"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {!data.goals.length && (
        <Empty>
          <h3>첫 목표를 만들어 보세요</h3>
          <p>
            목표 금액과 날짜, 연결할 계좌를 정하면 필요한 월 적립액을 계산해
            드려요.
          </p>
        </Empty>
      )}
      <div className="ledger-stack">
        {data.goals.map((goal) => (
          <article className="ledger-panel" key={goal.id}>
            <GoalCard goal={goal} data={data} />
            <GoalScenario goal={goal} data={data} />
            <div className="ledger-actions">
              <button
                className="ledger-text-btn"
                disabled={busy}
                onClick={() => edit(goal)}
              >
                목표 수정
              </button>
              <button
                className="ledger-text-btn"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "이 목표를 삭제할까요? 계좌와 거래는 유지됩니다.",
                    )
                  )
                    void change((next) => {
                      next.goals = next.goals.filter((g) => g.id !== goal.id);
                    }, "목표를 삭제했어요.");
                }}
              >
                목표 삭제
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
