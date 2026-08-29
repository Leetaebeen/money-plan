import { calculateAllocationPlans, type AllocationResult, type WindfallPlanInput } from "@money-plan/finance-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { MoneyField } from "../../components/MoneyField";
import { SkipLink } from "../../components/SkipLink";
import {
  buildWindfallInput,
  createEmptyWindfallDraft,
  formatWon,
  monthlyStructuralDeficitWon,
  type FormErrors,
  type ProfileDraft,
  type WindfallFormDraft,
} from "../../domain/plan-form";

interface WindfallPlannerProps {
  profile: ProfileDraft;
  initialDraft?: WindfallFormDraft;
  restoredDraft?: boolean;
  storageError?: string | null;
  onDraftChange: (draft: WindfallFormDraft) => void;
  onCancel: (draft: WindfallFormDraft, changed: boolean) => Promise<void>;
  onCalculated: (
    input: WindfallPlanInput,
    result: AllocationResult,
    draft: WindfallFormDraft,
  ) => Promise<void>;
}

export function WindfallPlanner({
  profile,
  initialDraft,
  restoredDraft = false,
  storageError,
  onDraftChange,
  onCancel,
  onCalculated,
}: WindfallPlannerProps) {
  const [draft, setDraft] = useState<WindfallFormDraft>(() =>
    initialDraft ? structuredClone(initialDraft) : createEmptyWindfallDraft(),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const restoredAtStart = useRef(restoredDraft).current;
  const draftSignature = JSON.stringify(draft);
  const lastNotifiedSignature = useRef(draftSignature);
  const changedSinceMount = useRef(false);
  const structuralDeficitWon = useMemo(() => monthlyStructuralDeficitWon(profile), [profile]);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (draftSignature === lastNotifiedSignature.current) return;
    lastNotifiedSignature.current = draftSignature;
    changedSinceMount.current = true;
    onDraftChange(draft);
  }, [draft, draftSignature, onDraftChange]);

  const calculate = async () => {
    if (submitting) return;
    const built = buildWindfallInput(profile, draft);
    if (!built.value) {
      setErrors(built.errors);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);
    try {
      await onCalculated(built.value, calculateAllocationPlans(built.value), draft);
    } finally {
      setSubmitting(false);
    }
  };

  const leavePlanner = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onCancel(draft, changedSinceMount.current);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="planner-shell">
      <SkipLink />
      <div className="planner-topbar">
        <button className="icon-button" type="button" disabled={submitting} onClick={() => void leavePlanner()} aria-label="홈으로 돌아가기">←</button>
        <span>여윳돈 나누기</span>
        <button className="text-button" type="button" disabled={submitting} onClick={() => void leavePlanner()}>나가기</button>
      </div>

      <p className="draft-save-state">입력 변경 내용은 서버로 보내지 않고 이 브라우저에 자동 저장됩니다.</p>

      {restoredAtStart ? (
        <div className="draft-restored" role="status">작성 중이던 여윳돈 입력을 이 브라우저에서 복구했어요.</div>
      ) : null}

      <form id="main-content" className="planner-form" aria-busy={submitting} tabIndex={-1} onSubmit={(event) => event.preventDefault()}>
        <fieldset disabled={submitting}>
        {storageError ? <div className="error-summary" role="alert"><p>{storageError}</p></div> : null}
        {Object.keys(errors).length > 0 ? (
          <div className="error-summary" role="alert">
            <strong>확인할 입력이 있어요.</strong>
            <p>{Object.values(errors)[0]}</p>
          </div>
        ) : null}

        <section className="form-section">
          <span className="eyebrow">추가 수입</span>
          <h1 ref={headingRef} tabIndex={-1}>이번에 생긴 여윳돈을 어떻게 나눌까요?</h1>
          <p className="section-lead">기존 월급 계획은 그대로 두고, 이번에 생긴 돈만 다시 계산합니다.</p>

          <MoneyField
            id="windfall-amount"
            label="생긴 여윳돈"
            hint="보너스, 환급금, 중고거래 대금처럼 이번에 한 번 들어온 금액"
            value={draft.amountWon}
            onChange={(value) => setDraft((current) => ({ ...current, amountWon: value }))}
            error={errors.amountWon}
            autoFocus
          />
          <MoneyField
            id="windfall-tax"
            label="먼저 둘 세금 준비금"
            hint="세금 발생 여부와 금액은 직접 확인해 입력해 주세요. 앱이 세율을 추정하지 않습니다."
            value={draft.taxReserveWon}
            onChange={(value) => setDraft((current) => ({ ...current, taxReserveWon: value }))}
            error={errors.taxReserveWon}
          />
          <MoneyField
            id="windfall-near-term"
            label="곧 사용할 금액"
            hint="12개월 안에 쓸 가능성이 있어 다른 목적에 묶지 않을 돈"
            value={draft.nearTermReserveWon}
            onChange={(value) => setDraft((current) => ({ ...current, nearTermReserveWon: value }))}
            error={errors.nearTermReserveWon}
          />

          {structuralDeficitWon !== null && structuralDeficitWon > 0 ? (
            <fieldset className="choice-fieldset choice-fieldset--warning">
              <legend>월 예산 부족분을 몇 개월치 먼저 둘까요?</legend>
              <p>현재 입력 기준으로 필수지출이 월급보다 매달 {formatWon(structuralDeficitWon)} 많아요. 이 돈은 적자를 없애는 것이 아니라 잠시 대응할 현금입니다.</p>
              <div className="choice-grid choice-grid--months">
                {[1, 2, 3, 6, 9, 12].map((months) => (
                  <button
                    key={months}
                    type="button"
                    className={draft.deficitCoverageMonths === months ? "is-selected" : ""}
                    onClick={() => setDraft((current) => ({ ...current, deficitCoverageMonths: months }))}
                    aria-pressed={draft.deficitCoverageMonths === months}
                  >
                    {months}개월
                  </button>
                ))}
              </div>
              {errors.deficitCoverageMonths ? <p className="field__error">{errors.deficitCoverageMonths}</p> : null}
            </fieldset>
          ) : null}
        </section>

        {profile.goals.length > 0 ? (
          <section className="form-section form-section--subsequent">
            <span className="eyebrow">선택사항</span>
            <h2>등록한 목표에 추가할 금액이 있나요?</h2>
            <p className="section-lead">입력하지 않은 목표에는 이번 여윳돈을 따로 반영하지 않아요.</p>
            <div className="catchup-list">
              {profile.goals.map((goal, index) => (
                <div className="catchup-card" key={goal.id}>
                  <div>
                    <span>우선순위 {index + 1}</span>
                    <strong>{goal.label}</strong>
                  </div>
                  <MoneyField
                    id={`catchup-${goal.id}`}
                    label="추가 적립액"
                    value={draft.goalCatchUps[goal.id] ?? ""}
                    onChange={(value) => setDraft((current) => ({
                      ...current,
                      goalCatchUps: { ...current.goalCatchUps, [goal.id]: value },
                    }))}
                    error={errors[`goalCatchUps.${goal.id}`]}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="disclosure-card">
          <strong>세금과 금융상품은 자동 판단하지 않아요.</strong>
          <p>입력한 준비금을 먼저 떼고 남은 금액에만 세 가지 예산 시나리오를 적용합니다.</p>
        </div>

        <div className="sticky-actions">
          <button className="button button--secondary" type="button" disabled={submitting} onClick={() => void leavePlanner()}>취소</button>
          <button className="button button--primary" type="button" disabled={submitting} onClick={() => void calculate()}>
            {submitting ? "계산 준비 중…" : "세 가지 시나리오 계산하기"}
          </button>
        </div>
        </fieldset>
      </form>
    </main>
  );
}
