import { useState } from "react";
import { goalScenario } from "./goal-scenario";
import { money, won, type Goal, type Ledger } from "./model";

export function GoalScenario({ goal, data }: { goal: Goal; data: Ledger }) {
  const [extra, setExtra] = useState("100000");
  const [cut, setCut] = useState("0");
  const [inputs, setInputs] = useState<{ extra: number; cut: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  let result: ReturnType<typeof goalScenario> | null = null;
  let calculationError = "";
  if (inputs) {
    try {
      result = goalScenario(data, goal.id, inputs.extra, inputs.cut);
    } catch (e) {
      calculationError =
        e instanceof Error ? e.message : "계획을 확인해 주세요.";
    }
  }
  return (
    <details className="ledger-goal-scenario">
      <summary>저축액을 바꾸면 언제 달성할까요?</summary>
      <form
        className="ledger-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          setInputs(null);
          try {
            setInputs({
              extra: money(extra),
              cut: data.monthlyPlan ? money(cut) : 0,
            });
          } catch (e) {
            setError(e instanceof Error ? e.message : "금액을 확인해 주세요.");
          }
        }}
      >
        <div className="ledger-fields">
          <label>
            이 목표에 매달 더 모을 돈 (원)
            <input
              required
              inputMode="numeric"
              value={extra}
              onChange={(e) => {
                setExtra(e.target.value);
                setInputs(null);
                setError("");
              }}
            />
          </label>
          {data.monthlyPlan && (
            <label>
              월 생활비를 줄여 마련할 돈 (원)
              <input
                required
                inputMode="numeric"
                value={cut}
                onChange={(e) => {
                  setCut(e.target.value);
                  setInputs(null);
                  setError("");
                }}
              />
            </label>
          )}
        </div>
        <button className="ledger-btn" type="submit">
          달성일 비교
        </button>
      </form>
      {(error || calculationError) && (
        <p className="ledger-error" role="alert">
          {error || calculationError}
        </p>
      )}
      {result && (
        <div aria-live="polite">
          <dl className="ledger-budget-breakdown">
            <div>
              <dt>현재 월 적립액</dt>
              <dd>{won(result.before.monthly)}</dd>
            </div>
            <div>
              <dt>변경 가정 월 적립액</dt>
              <dd>{won(result.after.monthly)}</dd>
            </div>
            <div>
              <dt>현재 예상 달성일</dt>
              <dd>{result.before.projected ?? "계산 범위 내 도달일 없음"}</dd>
            </div>
            <div>
              <dt>변경 가정 예상 달성일</dt>
              <dd>{result.after.projected ?? "계산 범위 내 도달일 없음"}</dd>
            </div>
            <div>
              <dt>목표일까지 월 추가 부족액</dt>
              <dd>
                {result.after.gap === null
                  ? "남은 납입일 없음"
                  : won(result.after.gap)}
              </dd>
            </div>
          </dl>
          <p>
            {result.monthsEarlier === null
              ? "현재 계획과 납입 회차 차이를 계산할 수 없어요."
              : result.monthsEarlier === 0
                ? "필요한 납입 횟수는 같아요."
                : `${result.monthsEarlier}회 적게 납입하면 도달해요.`}
            {result.meetsDeadline
              ? " 이 금액을 계속 납입하면 목표일 이내 도달하는 계산입니다."
              : " 이 가정으로는 목표일 이내 도달하지 못해요."}
          </p>
          {result.funding ? (
            <>
              <dl className="ledger-budget-breakdown">
                <div>
                  <dt>조정 후 월 생활비</dt>
                  <dd>{won(result.funding.livingAfter)}</dd>
                </div>
                <div>
                  <dt>계획 실행에 더 마련할 월 금액</dt>
                  <dd>{won(result.funding.additionalNeeded)}</dd>
                </div>
                <div>
                  <dt>조정 후 미배정액</dt>
                  <dd>{won(result.funding.unassigned)}</dd>
                </div>
              </dl>
              {result.funding.currentDeficit > 0 && (
                <p className="ledger-error">
                  현재 월급 계획의 부족액 {won(result.funding.currentDeficit)}도
                  함께 반영했습니다.
                </p>
              )}
              <p className="ledger-note">
                현재 미배정액과 입력한 생활비 절감액을 반영한 계산입니다. 다른
                목표의 배분액·고정비·예비비는 그대로이며, 실제로 생활비를 줄일
                수 있는지는 별도로 확인해 주세요.
              </p>
            </>
          ) : (
            <p className="ledger-note">
              월급 계획이 없어 추가 저축액을 마련할 수 있는지는 계산하지
              않았어요.
            </p>
          )}
        </div>
      )}
      <p className="ledger-note">
        저장되지 않는 비교입니다. 수익률 0%, 오늘 이후 매월 납입을 가정하며 향후
        출금·세금·수수료는 반영하지 않습니다. 적용하려면 월급 배분표 또는 목표의
        월 적립액을 직접 수정해 주세요.
      </p>
    </details>
  );
}
