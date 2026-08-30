import { useState, type FormEvent } from "react";
import type { AllocationResult, MonthlyPlanInput } from "@money-plan/finance-engine";
import { MoneyField } from "../../components/MoneyField";
import { ScenarioCard } from "../../components/ScenarioCard";
import { SkipLink } from "../../components/SkipLink";
import { UpdatePrompt } from "../../components/UpdatePrompt";
import { formatWon } from "../../domain/plan-form";
import {
  buildPublicCalculatorResult,
  createEmptyPublicCalculatorDraft,
  type PublicCalculatorDraft,
} from "./public-calculator";

interface CompletedCalculation {
  input: MonthlyPlanInput;
  result: AllocationResult;
}

const moneyFields = [
  ["monthlyNetIncomeWon", "세후 월급", "매달 통장에 실제로 들어오는 금액"],
  ["fixedEssentialWon", "고정 필수지출", "월세·관리비·통신비처럼 매달 고정된 필수비용"],
  ["variableEssentialWon", "변동 필수생활비", "식비·교통비처럼 매달 달라지는 필수비용"],
  ["irregularEssentialReserveWon", "비정기 필수비용 준비금", "비어 있으면 0원으로 계산합니다."],
  ["contractualDebtPaymentsWon", "약정 부채상환액", "비어 있으면 0원으로 계산합니다."],
  ["plannedFlexibleSpendWon", "자유지출 예산", "취미·외식처럼 이번 달에 따로 쓸 금액"],
  ["currentEmergencyFundWon", "현재 비상자금", "이미 모아둔 현금성 비상자금"],
] as const satisfies readonly [keyof PublicCalculatorDraft, string, string][];

const longTermChoices = [[true, "포함"], [false, "포함하지 않음"]] as const;

export function PublicCalculatorPage() {
  const [draft, setDraft] = useState(createEmptyPublicCalculatorDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [completed, setCompleted] = useState<CompletedCalculation | null>(null);

  const update = <Key extends keyof PublicCalculatorDraft,>(
    key: Key,
    value: PublicCalculatorDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`profile.${key}`];
      return next;
    });
  };

  const calculate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const built = buildPublicCalculatorResult(draft);
    setErrors(built.errors);
    if (!built.input || !built.result) {
      setCompleted(null);
      window.requestAnimationFrame(() => document.getElementById("calculator-errors")?.focus());
      return;
    }
    setCompleted({ input: built.input, result: built.result });
    window.requestAnimationFrame(() => document.getElementById("calculator-result")?.focus());
  };

  const derived = completed?.result.derived;

  return (
    <div className="calculator-shell">
      <SkipLink />
      <header className="site-header calculator-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="머니플랜 홈">
          <img src={`${import.meta.env.BASE_URL}money-plan-icon.svg`} alt="" />
          <span>머니플랜</span>
        </a>
        <span className="local-badge">입력 저장 안 함</span>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="calculator-hero">
          <span className="eyebrow">저장 없는 공개 계산기</span>
          <h1>이번 달 월급에서<br /><em>나눌 수 있는 돈</em>을 확인하세요.</h1>
          <p>입력은 이 페이지를 닫으면 사라지고 서버나 브라우저 저장소에 보관되지 않습니다.</p>
        </section>

        <div className="calculator-layout">
          <form className="calculator-form" noValidate onSubmit={calculate}>
            <div className="section-heading">
              <span className="eyebrow">필수 입력</span>
              <h2>월 현금 흐름</h2>
              <p>세후 월급과 필수비용은 추정하지 않고 직접 입력받습니다.</p>
            </div>

            {Object.keys(errors).length > 0 ? (
              <div className="error-summary" id="calculator-errors" role="alert" tabIndex={-1}>
                <strong>입력을 다시 확인해 주세요.</strong>
                <p>{Object.values(errors)[0]}</p>
              </div>
            ) : null}

            {moneyFields.map(([key, label, hint], index) => (
              <MoneyField
                key={key}
                id={`calculator-${key}`}
                label={label}
                hint={hint}
                value={draft[key] as string}
                error={errors[`profile.${key}`]}
                autoFocus={index === 0}
                onChange={(value) => update(key, value)}
              />
            ))}

            <fieldset className="choice-fieldset">
              <legend>비상자금 목표 개월</legend>
              <p>필수비용을 몇 개월치 보관할지 직접 선택하세요.</p>
              <div className="choice-grid choice-grid--months">
                {[0, 3, 6, 9, 12].map((months) => (
                  <button
                    className={draft.emergencyTargetMonths === months ? "is-selected" : ""}
                    key={months}
                    type="button"
                    aria-pressed={draft.emergencyTargetMonths === months}
                    onClick={() => update("emergencyTargetMonths", months)}
                  >
                    {months === 0 ? "설정 안 함" : `${months}개월`}
                  </button>
                ))}
              </div>
              {errors["profile.emergencyTargetMonths"] ? (
                <p className="field__error">{errors["profile.emergencyTargetMonths"]}</p>
              ) : null}
            </fieldset>

            <fieldset className="choice-fieldset">
              <legend>장기목표 몫을 포함할까요?</legend>
              <p>포함 여부만 반영하며 특정 상품이나 수익률은 제시하지 않습니다.</p>
              <div className="choice-grid">
                {longTermChoices.map(([enabled, label]) => (
                  <button
                    className={draft.longTermGoalEnabled === enabled ? "is-selected" : ""}
                    key={label}
                    type="button"
                    aria-pressed={draft.longTermGoalEnabled === enabled}
                    onClick={() => update("longTermGoalEnabled", enabled)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {errors["profile.longTermGoalEnabled"] ? (
                <p className="field__error">{errors["profile.longTermGoalEnabled"]}</p>
              ) : null}
            </fieldset>

            <button className="button button--primary button--large button--full" type="submit">
              계산 결과 보기
            </button>
          </form>

          <section
            className="calculator-result"
            id="calculator-result"
            aria-live="polite"
            tabIndex={completed ? -1 : undefined}
          >
            {!completed || !derived ? (
              <div className="calculator-placeholder">
                <span className="eyebrow">계산 전</span>
                <h2>입력하면 여기에서 결과를 비교할 수 있어요.</h2>
                <p>이 빠른 계산기는 개인 목표를 등록하지 않습니다. 자세한 계획은 머니플랜 본 화면에서 만들 수 있어요.</p>
              </div>
            ) : (
              <>
                <div className="calculator-summary">
                  <span className="eyebrow">계산 결과</span>
                  <h2>{completed.result.status === "STRUCTURAL_DEFICIT" ? "필수비용부터 조정이 필요해요." : "이번 달 배분 가능액"}</h2>
                  <strong>{formatWon(derived.deployableWon)}</strong>
                  <dl>
                    <div><dt>월 필수비용</dt><dd>{formatWon(derived.coreMonthlyCostWon)}</dd></div>
                    <div><dt>필수비용 후 잉여</dt><dd>{formatWon(derived.hardSurplusWon)}</dd></div>
                    <div><dt>비상자금 목표</dt><dd>{formatWon(derived.emergencyTargetWon)}</dd></div>
                    <div><dt>비상자금 부족액</dt><dd>{formatWon(derived.emergencyGapWon)}</dd></div>
                  </dl>
                </div>

                {completed.result.status === "READY" ? (
                  <div className="calculator-scenarios">
                    <div className="section-heading">
                      <span className="eyebrow">세 가지 안</span>
                      <h2>자동 선택 없이 같은 기준으로 비교</h2>
                    </div>
                    <div className="scenario-grid">
                      {completed.result.scenarios.map((scenario) => (
                        <ScenarioCard
                          key={scenario.scenarioId}
                          scenario={scenario}
                          derived={derived}
                          input={completed.input}
                          selected={false}
                          saving={false}
                          selectionDisabled
                          showSaveAction={false}
                          onSelect={() => undefined}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="status-panel status-panel--warning">
                    <span>현금 흐름 점검</span>
                    <h2>세 가지 배분안은 만들지 않았습니다.</h2>
                    <p>필수비용이 월급보다 크거나 자유지출 후 남는 금액이 없으면 배분 비율을 제시하지 않습니다.</p>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <section className="calculator-disclosure" aria-labelledby="calculator-disclosure-title">
          <h2 id="calculator-disclosure-title">계산 범위</h2>
          <p>교육용 예산 계산이며 금융상품 취득·처분 권유, 예상수익률 또는 자동 선택을 제공하지 않습니다. 개인 목표까지 반영하려면 <a href={import.meta.env.BASE_URL}>전체 월급 계획</a>을 이용하세요.</p>
        </section>
      </main>

      <footer className="site-footer">
        <strong>머니플랜 공개 계산기</strong>
        <p>입력값을 저장하거나 서버로 전송하지 않습니다.</p>
      </footer>
      <UpdatePrompt />
    </div>
  );
}
