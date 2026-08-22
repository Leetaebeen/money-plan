import { useState } from "react";
import type {
  AllocationInput,
  AllocationResult,
  ScenarioId,
} from "@money-plan/finance-engine";
import { ScenarioCard } from "../../components/ScenarioCard";
import { formatWon } from "../../domain/plan-form";
import {
  educationalDisclosure,
  issueMessage,
  preAllocationNames,
} from "../../presentation/messages.ko";

interface PlanResultsProps {
  input: AllocationInput;
  result: AllocationResult;
  selectedScenarioId: ScenarioId | null;
  onBack: () => void;
  onHome: () => void;
  onSelectScenario: (scenarioId: ScenarioId) => Promise<void>;
}

export function PlanResults({
  input,
  result,
  selectedScenarioId,
  onBack,
  onHome,
  onSelectScenario,
}: PlanResultsProps) {
  const [savingScenarioId, setSavingScenarioId] = useState<ScenarioId | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const derived = result.derived;

  const selectScenario = async (scenarioId: ScenarioId) => {
    setSavingScenarioId(scenarioId);
    setSaveError(null);
    try {
      await onSelectScenario(scenarioId);
    } catch {
      setSaveError("계획을 기기에 저장하지 못했어요. 브라우저 저장공간을 확인해 주세요.");
    } finally {
      setSavingScenarioId(null);
    }
  };

  return (
    <main className="results-shell">
      <div className="planner-topbar results-topbar">
        <button className="icon-button" type="button" onClick={onBack} aria-label="입력 화면으로 돌아가기">←</button>
        <span>계산 결과</span>
        <button className="text-button" type="button" onClick={onHome}>홈</button>
      </div>

      <section className="results-hero">
        <span className="eyebrow">{result.asOf} 기준 · 규칙 {result.ruleVersion}</span>
        <h1>{input.mode === "MONTHLY_SALARY" ? "이번 달 돈의 순서를 확인해 보세요." : "이번 여윳돈의 세 가지 배분안이에요."}</h1>
        <p>아직 어떤 안도 자동으로 선택하지 않았어요. 금액과 이유를 비교한 뒤 직접 저장하세요.</p>
      </section>

      {derived ? (
        <section className="calculation-card" aria-labelledby="calculation-title">
          <div className="calculation-card__head">
            <div>
              <span className="eyebrow">계산 구조</span>
              <h2 id="calculation-title">어떻게 나온 금액인가요?</h2>
            </div>
            <strong>{formatWon(derived.deployableWon)}</strong>
          </div>
          <dl>
            {input.mode === "MONTHLY_SALARY" ? (
              <>
                <div><dt>세후 월급</dt><dd>{formatWon(input.profile.monthlyNetIncomeWon)}</dd></div>
                <div className="is-minus"><dt>핵심 월비용</dt><dd>- {formatWon(derived.coreMonthlyCostWon)}</dd></div>
                <div className="is-minus"><dt>자유지출 예산</dt><dd>- {formatWon(input.profile.plannedFlexibleSpendWon)}</dd></div>
              </>
            ) : (
              <div><dt>입력한 여윳돈</dt><dd>{formatWon(input.amountWon)}</dd></div>
            )}
            {result.preAllocations.map((allocation) => (
              <div className="is-minus" key={allocation.bucket}>
                <dt>{preAllocationNames[allocation.bucket]}</dt>
                <dd>- {formatWon(allocation.amountWon)}</dd>
              </div>
            ))}
            <div className="is-total"><dt>시나리오 배분 가능액</dt><dd>{formatWon(derived.deployableWon)}</dd></div>
          </dl>
        </section>
      ) : null}

      {result.status === "INVALID" ? (
        <section className="status-panel status-panel--warning">
          <span>입력 확인 필요</span>
          <h2>계산할 수 없는 입력이 있어요.</h2>
          <ul>{result.issues.map((issue) => <li key={`${issue.path}-${issue.code}`}>{issueMessage(issue)}</li>)}</ul>
          <button className="button button--primary" type="button" onClick={onBack}>입력 다시 확인</button>
        </section>
      ) : null}

      {result.status === "STRUCTURAL_DEFICIT" && derived ? (
        <section className="status-panel status-panel--warning">
          <span>월 예산 부족</span>
          <h2>필수지출이 세후 월급보다 매달 {formatWon(derived.structuralDeficitWon)} 많아요.</h2>
          <p>현재 상태에서는 저축이나 장기목표 시나리오를 만들지 않았어요. 먼저 입력이 중복되지 않았는지 확인해 주세요.</p>
          <button className="button button--primary" type="button" onClick={onBack}>지출 입력 다시 확인</button>
        </section>
      ) : null}

      {result.status === "DEFICIT_REVIEW_REQUIRED" && derived ? (
        <section className="status-panel status-panel--warning">
          <span>선택 필요</span>
          <h2>월 부족분 {formatWon(derived.structuralDeficitWon)}을 몇 개월치 둘지 선택해 주세요.</h2>
          <p>앱이 대응 기간을 임의로 정하지 않기 때문에 시나리오 계산을 멈췄어요.</p>
          <button className="button button--primary" type="button" onClick={onBack}>대응 기간 선택</button>
        </section>
      ) : null}

      {result.status === "NO_DEPLOYABLE_AMOUNT" && derived ? (
        <section className="status-panel">
          <span>배분 가능액 0원</span>
          <h2>필요한 지출과 준비금을 반영하면 이번에 나눌 돈이 없어요.</h2>
          {derived.unmetCurrentCycleRequiredShortfallWon > 0 ? (
            <p className="warning-copy">이번 달 추가 확정지출 중 {formatWon(derived.unmetCurrentCycleRequiredShortfallWon)}이 아직 부족해요.</p>
          ) : (
            <p>잘못된 결과가 아니라 입력한 우선지출을 모두 반영한 계산이에요.</p>
          )}
          <button className="button button--primary" type="button" onClick={onBack}>입력 다시 확인</button>
        </section>
      ) : null}

      {result.status === "READY" && derived ? (
        <section className="scenarios-section" aria-labelledby="scenarios-title">
          <div className="section-heading">
            <span className="eyebrow">직접 비교</span>
            <h2 id="scenarios-title">같은 돈, 서로 다른 세 가지 비중</h2>
            <p>세 카드의 순서와 크기는 같으며 어느 것도 추천안으로 강조하지 않습니다.</p>
          </div>

          {saveError ? <div className="error-summary" role="alert"><p>{saveError}</p></div> : null}

          <div className="scenario-grid">
            {result.scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.scenarioId}
                scenario={scenario}
                derived={derived}
                input={input}
                selected={selectedScenarioId === scenario.scenarioId}
                saving={savingScenarioId === scenario.scenarioId}
                onSelect={(scenarioId) => void selectScenario(scenarioId)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <aside className="legal-disclosure">
        <strong>꼭 확인해 주세요.</strong>
        <p>{educationalDisclosure}</p>
      </aside>
    </main>
  );
}
