import type { GoalDraft } from "../domain/plan-form";
import { MoneyField } from "./MoneyField";

interface GoalEditorProps {
  goals: GoalDraft[];
  onChange: (goals: GoalDraft[]) => void;
  errors: Record<string, string>;
  catchUps?: Record<string, string>;
  onCatchUpsChange?: (catchUps: Record<string, string>) => void;
}

function makeGoalId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createGoal(): GoalDraft {
  return {
    id: makeGoalId(),
    label: "",
    kind: "SHORT_TERM",
    targetWon: "",
    savedWon: "",
    monthsRemaining: "",
  };
}

export function GoalEditor({
  goals,
  onChange,
  errors,
  catchUps,
  onCatchUpsChange,
}: GoalEditorProps) {
  const updateGoal = (index: number, patch: Partial<GoalDraft>) => {
    onChange(goals.map((goal, goalIndex) => goalIndex === index ? { ...goal, ...patch } : goal));
  };

  const moveGoal = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= goals.length) return;
    const next = [...goals];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    onChange(next);
  };

  const removeGoal = (index: number) => {
    const removed = goals[index];
    onChange(goals.filter((_, goalIndex) => goalIndex !== index));
    if (removed && catchUps && onCatchUpsChange) {
      const next = { ...catchUps };
      delete next[removed.id];
      onCatchUpsChange(next);
    }
  };

  return (
    <div className="goals-editor">
      {goals.length === 0 ? (
        <div className="empty-state">
          <p>아직 등록한 목표가 없어요.</p>
          <span>여행비, 이사비, 부채상환처럼 기간이 있는 목표를 추가할 수 있어요.</span>
        </div>
      ) : null}

      {goals.map((goal, index) => {
        const base = `profile.goals[${index}]`;
        return (
          <section className="goal-card" key={goal.id} aria-labelledby={`goal-title-${goal.id}`}>
            <div className="goal-card__head">
              <div>
                <span className="eyebrow">우선순위 {index + 1}</span>
                <h3 id={`goal-title-${goal.id}`}>{goal.label || "새 목표"}</h3>
              </div>
              <div className="goal-card__actions" aria-label="목표 순서와 삭제">
                <button type="button" onClick={() => moveGoal(index, -1)} disabled={index === 0} aria-label="위로 이동">↑</button>
                <button type="button" onClick={() => moveGoal(index, 1)} disabled={index === goals.length - 1} aria-label="아래로 이동">↓</button>
                <button type="button" onClick={() => removeGoal(index)} aria-label="목표 삭제">삭제</button>
              </div>
            </div>

            <div className="field">
              <label htmlFor={`goal-label-${goal.id}`}>목표 이름</label>
              <input
                id={`goal-label-${goal.id}`}
                className="text-input"
                value={goal.label}
                maxLength={30}
                onChange={(event) => updateGoal(index, { label: event.target.value })}
                aria-invalid={Boolean(errors[`${base}.label`])}
                placeholder="예: 1년 뒤 이사비"
              />
              {errors[`${base}.label`] ? <p className="field__error">{errors[`${base}.label`]}</p> : null}
            </div>

            <div className="field">
              <label htmlFor={`goal-kind-${goal.id}`}>목표 종류</label>
              <select
                id={`goal-kind-${goal.id}`}
                className="select-input"
                value={goal.kind}
                onChange={(event) => updateGoal(index, { kind: event.target.value as GoalDraft["kind"] })}
              >
                <option value="SHORT_TERM">기간이 있는 생활 목표</option>
                <option value="DEBT_REPAYMENT">부채상환 목표</option>
                <option value="OTHER">기타 목표</option>
              </select>
            </div>

            <div className="two-column-fields">
              <MoneyField
                id={`goal-target-${goal.id}`}
                label="목표금액"
                value={goal.targetWon}
                onChange={(value) => updateGoal(index, { targetWon: value })}
                error={errors[`${base}.targetWon`]}
              />
              <MoneyField
                id={`goal-saved-${goal.id}`}
                label="현재 모은 금액"
                value={goal.savedWon}
                onChange={(value) => updateGoal(index, { savedWon: value })}
                error={errors[`${base}.savedWon`]}
              />
            </div>

            <div className="field">
              <label htmlFor={`goal-months-${goal.id}`}>목표까지 남은 기간</label>
              <div className="month-input">
                <input
                  id={`goal-months-${goal.id}`}
                  inputMode="numeric"
                  value={goal.monthsRemaining}
                  onChange={(event) => updateGoal(index, {
                    monthsRemaining: event.target.value.replace(/[^0-9]/gu, "").slice(0, 3),
                  })}
                  placeholder="12"
                  aria-invalid={Boolean(errors[`${base}.monthsRemaining`])}
                />
                <span>개월</span>
              </div>
              {errors[`${base}.monthsRemaining`] ? <p className="field__error">{errors[`${base}.monthsRemaining`]}</p> : null}
            </div>

            {catchUps && onCatchUpsChange ? (
              <MoneyField
                id={`goal-catchup-${goal.id}`}
                label="이번 여윳돈에서 추가할 금액"
                hint="입력하지 않으면 이 목표에는 여윳돈을 따로 반영하지 않아요."
                value={catchUps[goal.id] ?? ""}
                onChange={(value) => onCatchUpsChange({ ...catchUps, [goal.id]: value })}
                error={errors[`goalCatchUps.${goal.id}`]}
              />
            ) : null}
          </section>
        );
      })}

      {catchUps === undefined ? (
        <button
          className="button button--secondary button--full"
          type="button"
          onClick={() => onChange([...goals, createGoal()])}
          disabled={goals.length >= 50}
        >
          + 목표 추가
        </button>
      ) : null}
    </div>
  );
}
