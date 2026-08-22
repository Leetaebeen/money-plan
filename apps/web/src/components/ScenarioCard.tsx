import type {
  AllocationInput,
  DerivedMetrics,
  ScenarioId,
  ScenarioPlan,
} from "@money-plan/finance-engine";
import { formatWon } from "../domain/plan-form";
import {
  bucketNames,
  explanationMessage,
  scenarioDescriptions,
  scenarioNames,
} from "../presentation/messages.ko";

interface ScenarioCardProps {
  scenario: ScenarioPlan;
  derived: DerivedMetrics;
  input: AllocationInput;
  selected: boolean;
  saving: boolean;
  selectionDisabled: boolean;
  showSaveAction: boolean;
  onSelect: (scenarioId: ScenarioId) => void;
}

const bucketColors = {
  EMERGENCY_RESERVE: "var(--bucket-emergency)",
  USER_GOALS: "var(--bucket-goal)",
  LONG_TERM_GOAL: "var(--bucket-long)",
  UNASSIGNED: "var(--bucket-unassigned)",
} as const;

export function ScenarioCard({
  scenario,
  derived,
  input,
  selected,
  saving,
  selectionDisabled,
  showSaveAction,
  onSelect,
}: ScenarioCardProps) {
  const goalNames = new Map(input.profile.goals.map((goal) => [goal.id, goal.label]));
  const messages = scenario.explanations
    .map(explanationMessage)
    .filter((message): message is string => Boolean(message));

  return (
    <article className={`scenario-card ${selected ? "scenario-card--selected" : ""}`}>
      <header className="scenario-card__header">
        <div>
          <span className="eyebrow">비교 시나리오</span>
          <h3>{scenarioNames[scenario.scenarioId]}</h3>
          <p>{scenarioDescriptions[scenario.scenarioId]}</p>
        </div>
        {selected ? <span className="saved-badge">내가 저장함</span> : null}
      </header>

      <div className="allocation-bar" aria-label={`${scenarioNames[scenario.scenarioId]} 배분 비율`}>
        {scenario.allocations.map((allocation) => {
          const percentage = derived.deployableWon === 0
            ? 0
            : (allocation.amountWon / derived.deployableWon) * 100;
          return (
            <span
              key={allocation.bucket}
              style={{ width: `${percentage}%`, backgroundColor: bucketColors[allocation.bucket] }}
              title={`${bucketNames[allocation.bucket]} ${percentage.toFixed(1)}%`}
            />
          );
        })}
      </div>

      <dl className="allocation-list">
        {scenario.allocations.map((allocation) => {
          const percentage = derived.deployableWon === 0
            ? 0
            : Math.round((allocation.amountWon / derived.deployableWon) * 100);
          return (
            <div key={allocation.bucket}>
              <dt>
                <i style={{ backgroundColor: bucketColors[allocation.bucket] }} />
                {bucketNames[allocation.bucket]}
                <small>{percentage}%</small>
              </dt>
              <dd>{formatWon(allocation.amountWon)}</dd>
            </div>
          );
        })}
      </dl>

      {scenario.goalAllocations.length > 0 ? (
        <div className="goal-breakdown">
          <strong>목표별 금액</strong>
          <ul>
            {scenario.goalAllocations.map((goal) => (
              <li key={goal.goalId}>
                <span>{goalNames.get(goal.goalId) ?? "등록한 목표"}</span>
                <strong>{formatWon(goal.amountWon)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {messages.length > 0 ? (
        <ul className="scenario-notes">
          {messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      ) : null}

      {showSaveAction ? (
        <button
          className={`button button--full ${selected ? "button--saved" : "button--primary"}`}
          type="button"
          disabled={selectionDisabled}
          onClick={() => onSelect(scenario.scenarioId)}
        >
          {saving ? "저장 중…" : selected ? "이 시나리오를 저장했어요" : "이 시나리오 저장"}
        </button>
      ) : null}
    </article>
  );
}
