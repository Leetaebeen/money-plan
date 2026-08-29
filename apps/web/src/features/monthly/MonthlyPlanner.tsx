import { calculateAllocationPlans, type AllocationResult, type MonthlyPlanInput } from "@money-plan/finance-engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoalEditor } from "../../components/GoalEditor";
import { MoneyField } from "../../components/MoneyField";
import { SkipLink } from "../../components/SkipLink";
import { StepIndicator } from "../../components/StepIndicator";
import {
  buildMonthlyInput,
  createEmptyMonthlyDraft,
  formatWon,
  type FormErrors,
  type MonthlyFormDraft,
  type ProfileDraft,
} from "../../domain/plan-form";

const stepLabels = ["월급", "한 달 지출", "내 기준", "목표 확인"] as const;

const stepFields: readonly (readonly string[])[] = [
  ["profile.monthlyNetIncomeWon"],
  [
    "profile.fixedEssentialWon",
    "profile.variableEssentialWon",
    "profile.irregularEssentialReserveWon",
    "profile.contractualDebtPaymentsWon",
    "profile.plannedFlexibleSpendWon",
    "currentCycleRequiredShortfallWon",
  ],
  [
    "profile.currentEmergencyFundWon",
    "profile.emergencyTargetMonths",
    "profile.longTermGoalEnabled",
  ],
  ["profile.goals"],
];

interface MonthlyPlannerProps {
  initialProfile?: ProfileDraft;
  initialDraft?: MonthlyFormDraft;
  initialStep?: number;
  restoredDraft?: boolean;
  storageError?: string | null;
  onDraftChange: (draft: MonthlyFormDraft, step: number) => void;
  onCancel: (draft: MonthlyFormDraft, step: number, changed: boolean) => Promise<void>;
  onCalculated: (
    input: MonthlyPlanInput,
    result: AllocationResult,
    draft: MonthlyFormDraft,
    step: number,
  ) => Promise<void>;
}

function belongsToStep(path: string, step: number): boolean {
  return stepFields[step]!.some((prefix) => path === prefix || path.startsWith(`${prefix}[`) || path.startsWith(`${prefix}.`));
}

function stepForError(path: string): number {
  const found = stepFields.findIndex((_, index) => belongsToStep(path, index));
  return found === -1 ? stepLabels.length - 1 : found;
}

export function MonthlyPlanner({
  initialProfile,
  initialDraft,
  initialStep,
  restoredDraft = false,
  storageError,
  onDraftChange,
  onCancel,
  onCalculated,
}: MonthlyPlannerProps) {
  const [step, setStep] = useState(() => Math.max(0, Math.min(3, initialStep ?? 0)));
  const [draft, setDraft] = useState<MonthlyFormDraft>(() =>
    initialDraft ? structuredClone(initialDraft) : createEmptyMonthlyDraft(initialProfile),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const restoredAtStart = useRef(restoredDraft).current;
  const draftSignature = JSON.stringify({ draft, step });
  const lastNotifiedSignature = useRef(draftSignature);
  const changedSinceMount = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const focusedRestoredStep = useRef(false);

  useEffect(() => {
    if (draftSignature === lastNotifiedSignature.current) return;
    lastNotifiedSignature.current = draftSignature;
    changedSinceMount.current = true;
    onDraftChange(draft, step);
  }, [draft, draftSignature, onDraftChange, step]);

  useEffect(() => {
    const stepChanged = previousStep.current !== step;
    if (stepChanged || (restoredAtStart && !focusedRestoredStep.current)) {
      headingRef.current?.focus();
      focusedRestoredStep.current = true;
    }
    previousStep.current = step;
  }, [restoredAtStart, step]);

  const corePreview = useMemo(() => {
    const values = [
      draft.profile.fixedEssentialWon,
      draft.profile.variableEssentialWon,
      draft.profile.irregularEssentialReserveWon,
      draft.profile.contractualDebtPaymentsWon,
    ];
    if (values.some((value) => value === "")) return null;
    return values.reduce((sum, value) => sum + Number(value), 0);
  }, [draft.profile]);

  const updateProfile = (patch: Partial<ProfileDraft>) => {
    setDraft((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
  };

  const validateCurrentStep = (): boolean => {
    const built = buildMonthlyInput(draft);
    const currentErrors = Object.fromEntries(
      Object.entries(built.errors).filter(([path]) => belongsToStep(path, step)),
    );
    setErrors(currentErrors);
    return Object.keys(currentErrors).length === 0;
  };

  const goNext = () => {
    if (!validateCurrentStep()) return;
    setErrors({});
    setStep((current) => Math.min(current + 1, stepLabels.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const calculate = async () => {
    if (submitting) return;
    const built = buildMonthlyInput(draft);
    if (!built.value) {
      setErrors(built.errors);
      const firstPath = Object.keys(built.errors)[0];
      if (firstPath) setStep(stepForError(firstPath));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const result = calculateAllocationPlans(built.value);
    setSubmitting(true);
    try {
      await onCalculated(built.value, result, draft, step);
    } finally {
      setSubmitting(false);
    }
  };

  const leavePlanner = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onCancel(draft, step, changedSinceMount.current);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="planner-shell">
      <SkipLink />
      <div className="planner-topbar">
        <button className="icon-button" type="button" disabled={submitting} onClick={step === 0 ? () => void leavePlanner() : () => setStep((value) => value - 1)} aria-label="이전 화면">
          ←
        </button>
        <span>월급 계획 만들기</span>
        <button className="text-button" type="button" disabled={submitting} onClick={() => void leavePlanner()}>나가기</button>
      </div>

      <StepIndicator labels={stepLabels} current={step} />

      <p className="draft-save-state">입력 변경 내용은 서버로 보내지 않고 이 브라우저에 자동 저장됩니다.</p>

      {restoredAtStart ? (
        <div className="draft-restored" role="status">작성 중이던 입력과 단계를 이 브라우저에서 복구했어요.</div>
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

        {step === 0 ? (
          <section className="form-section">
            <span className="eyebrow">STEP 1</span>
            <h1 ref={headingRef} tabIndex={-1}>매달 실제로 받는 월급은 얼마인가요?</h1>
            <p className="section-lead">세금과 4대 보험을 뺀 뒤 통장에 들어오는 금액을 적어 주세요.</p>
            <MoneyField
              id="monthly-income"
              label="세후 월급"
              hint="성과급·보너스처럼 매달 들어오지 않는 돈은 여윳돈 기능에서 따로 나눠요."
              value={draft.profile.monthlyNetIncomeWon}
              onChange={(value) => updateProfile({ monthlyNetIncomeWon: value })}
              error={errors["profile.monthlyNetIncomeWon"]}
              autoFocus
            />
            <div className="privacy-note">
              <strong>이 금액은 서버로 보내지 않아요.</strong>
              <p>회원가입 없이 이 기기의 브라우저에만 저장합니다.</p>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="form-section">
            <span className="eyebrow">STEP 2</span>
            <h1 ref={headingRef} tabIndex={-1}>한 달에 꼭 나가는 돈을 알려주세요.</h1>
            <p className="section-lead">빈칸을 임의로 0원 처리하지 않아요. 없는 항목은 ‘없음 · 0원’을 눌러 주세요.</p>

            <MoneyField
              id="fixed-essential"
              label="고정 필수지출"
              hint="월세, 관리비, 통신비, 보험료처럼 매달 고정으로 나가는 돈"
              value={draft.profile.fixedEssentialWon}
              onChange={(value) => updateProfile({ fixedEssentialWon: value })}
              error={errors["profile.fixedEssentialWon"]}
            />
            <MoneyField
              id="variable-essential"
              label="변동 필수생활비"
              hint="식비, 교통비, 의료비처럼 달마다 달라지는 필수비용의 월평균"
              value={draft.profile.variableEssentialWon}
              onChange={(value) => updateProfile({ variableEssentialWon: value })}
              error={errors["profile.variableEssentialWon"]}
            />
            <MoneyField
              id="irregular-essential"
              label="비정기 필수비용 준비금"
              hint="연 보험료, 병원비, 수리비처럼 가끔 나가는 돈을 월 단위로 나눈 금액"
              value={draft.profile.irregularEssentialReserveWon}
              onChange={(value) => updateProfile({ irregularEssentialReserveWon: value })}
              error={errors["profile.irregularEssentialReserveWon"]}
            />
            <MoneyField
              id="debt-payment"
              label="약정 부채상환액"
              hint="대출·학자금·카드 할부의 매달 최소 약정 상환액"
              value={draft.profile.contractualDebtPaymentsWon}
              onChange={(value) => updateProfile({ contractualDebtPaymentsWon: value })}
              error={errors["profile.contractualDebtPaymentsWon"]}
            />
            <MoneyField
              id="flexible-spend"
              label="이번 달 자유지출 예산"
              hint="외식, 취미, 쇼핑처럼 사용자가 유지하기로 정한 한도"
              value={draft.profile.plannedFlexibleSpendWon}
              onChange={(value) => updateProfile({ plannedFlexibleSpendWon: value })}
              error={errors["profile.plannedFlexibleSpendWon"]}
            />
            <MoneyField
              id="current-shortfall"
              label="이번 달에만 추가로 꼭 나갈 돈"
              hint="위 항목에 포함하지 않은 확정지출만 입력해 중복을 피하세요."
              value={draft.currentCycleRequiredShortfallWon}
              onChange={(value) => setDraft((current) => ({ ...current, currentCycleRequiredShortfallWon: value }))}
              error={errors.currentCycleRequiredShortfallWon}
            />

            {corePreview !== null ? (
              <div className="formula-card">
                <span>현재 핵심 월비용</span>
                <strong>{formatWon(corePreview)}</strong>
                <p>고정 + 변동 + 비정기 준비금 + 약정 상환액</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 2 ? (
          <section className="form-section">
            <span className="eyebrow">STEP 3</span>
            <h1 ref={headingRef} tabIndex={-1}>안전망과 장기목표 기준을 직접 정해 주세요.</h1>
            <p className="section-lead">나이와 월급으로 자동 결정하지 않고, 선택한 기준만 계산에 사용합니다.</p>

            <MoneyField
              id="emergency-current"
              label="현재 따로 보관 중인 비상자금"
              value={draft.profile.currentEmergencyFundWon}
              onChange={(value) => updateProfile({ currentEmergencyFundWon: value })}
              error={errors["profile.currentEmergencyFundWon"]}
            />

            <fieldset className="choice-fieldset">
              <legend>핵심 월비용 몇 개월분을 비상자금 목표로 할까요?</legend>
              <p>0개월도 선택할 수 있지만 예상치 못한 지출을 감당할 현금이 없을 수 있어요.</p>
              <div className="choice-grid choice-grid--months">
                {[0, 1, 3, 6, 9, 12].map((months) => (
                  <button
                    key={months}
                    type="button"
                    className={draft.profile.emergencyTargetMonths === months ? "is-selected" : ""}
                    onClick={() => updateProfile({ emergencyTargetMonths: months })}
                    aria-pressed={draft.profile.emergencyTargetMonths === months}
                  >
                    {months}개월
                  </button>
                ))}
              </div>
              {errors["profile.emergencyTargetMonths"] ? <p className="field__error">{errors["profile.emergencyTargetMonths"]}</p> : null}
            </fieldset>

            <fieldset className="choice-fieldset">
              <legend>5년 이상 장기목표 몫도 비교안에 표시할까요?</legend>
              <p>특정 ETF나 상품이 아니라 ‘장기목표’라는 예산 용도만 표시합니다.</p>
              <div className="choice-grid">
                <button
                  type="button"
                  className={draft.profile.longTermGoalEnabled === true ? "is-selected" : ""}
                  onClick={() => updateProfile({ longTermGoalEnabled: true })}
                  aria-pressed={draft.profile.longTermGoalEnabled === true}
                >
                  네, 표시할게요
                </button>
                <button
                  type="button"
                  className={draft.profile.longTermGoalEnabled === false ? "is-selected" : ""}
                  onClick={() => updateProfile({ longTermGoalEnabled: false })}
                  aria-pressed={draft.profile.longTermGoalEnabled === false}
                >
                  아니요, 지금은 제외해요
                </button>
              </div>
              {errors["profile.longTermGoalEnabled"] ? <p className="field__error">{errors["profile.longTermGoalEnabled"]}</p> : null}
            </fieldset>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="form-section">
            <span className="eyebrow">STEP 4</span>
            <h1 ref={headingRef} tabIndex={-1}>기간이 있는 목표가 있나요?</h1>
            <p className="section-lead">선택사항이에요. 목표 순서가 곧 배분 우선순위가 됩니다.</p>
            <GoalEditor
              goals={draft.profile.goals}
              onChange={(goals) => updateProfile({ goals })}
              errors={errors}
            />

            <div className="review-card">
              <span className="eyebrow">입력 확인</span>
              <h2>세 가지 비교안을 만들 준비가 됐어요.</h2>
              <dl>
                <div><dt>세후 월급</dt><dd>{formatWon(Number(draft.profile.monthlyNetIncomeWon || 0))}</dd></div>
                <div><dt>비상자금 기준</dt><dd>{draft.profile.emergencyTargetMonths ?? "-"}개월</dd></div>
                <div><dt>등록 목표</dt><dd>{draft.profile.goals.length}개</dd></div>
                <div><dt>장기목표 몫</dt><dd>{draft.profile.longTermGoalEnabled ? "표시" : "제외"}</dd></div>
              </dl>
            </div>
          </section>
        ) : null}

        <div className="sticky-actions">
          {step > 0 ? (
            <button className="button button--secondary" type="button" disabled={submitting} onClick={() => setStep((value) => value - 1)}>
              이전
            </button>
          ) : null}
          {step < stepLabels.length - 1 ? (
            <button className="button button--primary" type="button" disabled={submitting} onClick={goNext}>
              다음
            </button>
          ) : (
            <button className="button button--primary" type="button" disabled={submitting} onClick={() => void calculate()}>
              {submitting ? "계산 준비 중…" : "세 가지 시나리오 계산하기"}
            </button>
          )}
        </div>
        </fieldset>
      </form>
    </main>
  );
}
