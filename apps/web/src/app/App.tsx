import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AllocationInput,
  AllocationResult,
  MonthlyPlanInput,
  ScenarioId,
  WindfallPlanInput,
} from "@money-plan/finance-engine";
import { UpdatePrompt } from "../components/UpdatePrompt";
import {
  formatWon,
  type MonthlyFormDraft,
  type WindfallFormDraft,
} from "../domain/plan-form";
import { MonthlyPlanner } from "../features/monthly/MonthlyPlanner";
import { PlanResults } from "../features/results/PlanResults";
import { WindfallPlanner } from "../features/windfall/WindfallPlanner";
import {
  DraftConflictError,
  ProfileConflictError,
  deleteAllLocalData,
  deletePlannerDraft,
  deletePlanRun,
  exportLocalData,
  loadPlanRuns,
  loadProfile,
  prepareMonthlyDraftContext,
  preparePlannerDraftSession,
  prepareWindfallDraftContext,
  requestPersistentStorage,
  saveMonthlyDraft,
  saveMonthlyDraftAndProfile,
  savePlanRun,
  saveWindfallDraft,
  type DraftWriteReference,
  type StoredMonthlyDraft,
  type StoredPlanRun,
  type StoredProfile,
  type StoredWindfallDraft,
} from "../persistence/db";
import { scenarioNames } from "../presentation/messages.ko";

type Screen = "HOME" | "MONTHLY" | "WINDFALL" | "RESULT";

interface ActiveCalculation {
  input: AllocationInput;
  result: AllocationResult;
  source: "MONTHLY" | "WINDFALL" | "SAVED";
  savedAt?: string;
  draftReference?: DraftWriteReference;
}

function draftStorageError(error: unknown, fallback: string): string {
  return error instanceof DraftConflictError ? error.message : fallback;
}

function emptyDraftReference(id: "monthly" | "windfall"): DraftWriteReference {
  return {
    id,
    sessionId: crypto.randomUUID(),
    generation: 0,
    revision: 0,
    versionToken: null,
  };
}

function referenceForStoredDraft(
  draft: StoredMonthlyDraft | StoredWindfallDraft,
): DraftWriteReference {
  return {
    id: draft.id,
    sessionId: draft.sessionId,
    generation: draft.generation,
    revision: draft.revision,
    versionToken: draft.versionToken,
  };
}

export function App() {
  const [screen, setScreen] = useState<Screen>("HOME");
  const [loading, setLoading] = useState(true);
  const [dataBusy, setDataBusy] = useState(false);
  const dataBusyRef = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storedProfile, setStoredProfile] = useState<StoredProfile | undefined>();
  const [latestPlan, setLatestPlan] = useState<StoredPlanRun | undefined>();
  const [planRuns, setPlanRuns] = useState<StoredPlanRun[]>([]);
  const [active, setActive] = useState<ActiveCalculation | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<ScenarioId | null>(null);
  const [monthlyDraft, setMonthlyDraft] = useState<StoredMonthlyDraft | undefined>();
  const [windfallDraft, setWindfallDraft] = useState<StoredWindfallDraft | undefined>();
  const [hasMonthlyDraft, setHasMonthlyDraft] = useState(false);
  const [hasWindfallDraft, setHasWindfallDraft] = useState(false);
  const monthlyReferenceRef = useRef<DraftWriteReference>(emptyDraftReference("monthly"));
  const windfallReferenceRef = useRef<DraftWriteReference>(emptyDraftReference("windfall"));
  const monthlyWriteSequenceRef = useRef(0);
  const windfallWriteSequenceRef = useRef(0);
  const monthlySaveTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const windfallSaveTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const [monthlyPlannerKey, setMonthlyPlannerKey] = useState(0);
  const [windfallPlannerKey, setWindfallPlannerKey] = useState(0);

  const beginDataOperation = () => {
    if (dataBusyRef.current) return false;
    dataBusyRef.current = true;
    setDataBusy(true);
    return true;
  };

  const finishDataOperation = () => {
    dataBusyRef.current = false;
    setDataBusy(false);
  };

  useEffect(() => {
    let mounted = true;
    void Promise.allSettled([
      loadProfile(),
      loadPlanRuns(),
      preparePlannerDraftSession("monthly"),
      preparePlannerDraftSession("windfall"),
    ]).then((results) => {
      if (!mounted) return;
      const [profileResult, planResult, monthlyResult, windfallResult] = results;
      const profile = profileResult.status === "fulfilled" ? profileResult.value : undefined;

      setStoredProfile(profile);
      if (planResult.status === "fulfilled") {
        setPlanRuns(planResult.value);
        setLatestPlan(planResult.value[0]);
      }
      if (monthlyResult.status === "fulfilled") {
        monthlyReferenceRef.current = monthlyResult.value.reference;
        if (monthlyResult.value.draft?.id === "monthly") {
          setMonthlyDraft(monthlyResult.value.draft);
          setHasMonthlyDraft(true);
        }
      }
      if (windfallResult.status === "fulfilled") {
        windfallReferenceRef.current = windfallResult.value.reference;
      }
      if (
        windfallResult.status === "fulfilled" &&
        windfallResult.value.draft?.id === "windfall" &&
        profile &&
        windfallResult.value.draft.baseProfileUpdatedAt === profile.updatedAt
      ) {
        setWindfallDraft(windfallResult.value.draft);
        setHasWindfallDraft(true);
      } else if (
        profileResult.status === "fulfilled" &&
        windfallResult.status === "fulfilled" &&
        windfallResult.value.draft?.id === "windfall"
      ) {
        void deletePlannerDraft("windfall", windfallResult.value.reference)
          .then(() => preparePlannerDraftSession("windfall"))
          .then((prepared) => {
            if (mounted) windfallReferenceRef.current = prepared.reference;
          })
          .catch(async () => {
            if (!mounted) return;
            try {
              const latest = await preparePlannerDraftSession("windfall");
              if (!mounted) return;
              windfallReferenceRef.current = latest.reference;
              if (
                latest.draft?.id === "windfall" &&
                profile &&
                latest.draft.baseProfileUpdatedAt === profile.updatedAt
              ) {
                setWindfallDraft(latest.draft);
                setHasWindfallDraft(true);
              }
            } catch {
              // The shared load error below remains the user-facing fallback.
            } finally {
              if (mounted) setStorageError("이전 여윳돈 초안 상태가 다른 화면에서 변경되었어요.");
            }
          });
      }
      if (results.some((result) => result.status === "rejected")) {
        setStorageError("기기에 저장된 일부 데이터를 불러오지 못했어요.");
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const queueMonthlyDraftSave = useCallback((
    draft: MonthlyFormDraft,
    step: number,
    updatedAt = new Date().toISOString(),
  ) => {
    const operation = monthlySaveTailRef.current.then(async () => {
      const expected = structuredClone(monthlyReferenceRef.current);
      const stored = await saveMonthlyDraft(draft, step, expected, updatedAt);
      monthlyReferenceRef.current = referenceForStoredDraft(stored);
      return stored;
    });
    monthlySaveTailRef.current = operation;
    return operation;
  }, []);

  const queueMonthlyCalculationSave = useCallback((
    draft: MonthlyFormDraft,
    step: number,
    expectedProfileUpdatedAt: string | null,
  ) => {
    const operation = monthlySaveTailRef.current.then(async () => {
      const expected = structuredClone(monthlyReferenceRef.current);
      const stored = await saveMonthlyDraftAndProfile(
        draft,
        step,
        expected,
        expectedProfileUpdatedAt,
      );
      monthlyReferenceRef.current = referenceForStoredDraft(stored.draft);
      return stored;
    });
    monthlySaveTailRef.current = operation;
    return operation;
  }, []);

  const queueWindfallDraftSave = useCallback((
    draft: WindfallFormDraft,
    baseProfileUpdatedAt: string,
    updatedAt = new Date().toISOString(),
  ) => {
    const operation = windfallSaveTailRef.current.then(async () => {
      const expected = structuredClone(windfallReferenceRef.current);
      const stored = await saveWindfallDraft(draft, baseProfileUpdatedAt, expected, updatedAt);
      windfallReferenceRef.current = referenceForStoredDraft(stored);
      return stored;
    });
    windfallSaveTailRef.current = operation;
    return operation;
  }, []);

  const reconcileMonthlyDraft = useCallback(async (expectedSequence?: number) => {
    while (true) {
      const monthlyTail = monthlySaveTailRef.current;
      const windfallTail = windfallSaveTailRef.current;
      await Promise.all([
        monthlyTail.catch(() => undefined),
        windfallTail.catch(() => undefined),
      ]);
      if (
        monthlySaveTailRef.current === monthlyTail &&
        windfallSaveTailRef.current === windfallTail
      ) break;
    }
    const context = await prepareMonthlyDraftContext();
    const prepared = context.monthly;
    if (expectedSequence !== undefined && monthlyWriteSequenceRef.current !== expectedSequence) {
      return context;
    }
    monthlyWriteSequenceRef.current += 1;
    windfallWriteSequenceRef.current += 1;
    monthlyReferenceRef.current = prepared.reference;
    windfallReferenceRef.current = context.windfall.reference;
    monthlySaveTailRef.current = Promise.resolve();
    windfallSaveTailRef.current = Promise.resolve();
    setStoredProfile(context.profile);
    if (prepared.draft?.id === "monthly") {
      setMonthlyDraft(prepared.draft);
      setHasMonthlyDraft(true);
    } else {
      setMonthlyDraft(undefined);
      setHasMonthlyDraft(false);
    }
    if (
      context.windfall.draft?.id === "windfall" &&
      context.profile &&
      context.windfall.draft.baseProfileUpdatedAt === context.profile.updatedAt
    ) {
      setWindfallDraft(context.windfall.draft);
      setHasWindfallDraft(true);
    } else {
      setWindfallDraft(undefined);
      setHasWindfallDraft(false);
    }
    setMonthlyPlannerKey((value) => value + 1);
    setWindfallPlannerKey((value) => value + 1);
    return context;
  }, []);

  const reconcileWindfallDraft = useCallback(async (expectedSequence?: number) => {
    while (true) {
      const tail = windfallSaveTailRef.current;
      await tail.catch(() => undefined);
      if (windfallSaveTailRef.current === tail) break;
    }
    const context = await prepareWindfallDraftContext();
    const prepared = context.prepared;
    if (expectedSequence !== undefined && windfallWriteSequenceRef.current !== expectedSequence) {
      return context;
    }
    windfallWriteSequenceRef.current += 1;
    windfallReferenceRef.current = prepared.reference;
    windfallSaveTailRef.current = Promise.resolve();
    setStoredProfile(context.profile);
    if (prepared.draft?.id === "windfall") {
      setWindfallDraft(prepared.draft);
      setHasWindfallDraft(true);
    } else {
      setWindfallDraft(undefined);
      setHasWindfallDraft(false);
    }
    setWindfallPlannerKey((value) => value + 1);
    return context;
  }, []);

  const persistMonthlyDraft = useCallback((draft: MonthlyFormDraft, step: number) => {
    const writeSequence = ++monthlyWriteSequenceRef.current;
    const updatedAt = new Date().toISOString();
    setHasMonthlyDraft(true);
    void queueMonthlyDraftSave(draft, step, updatedAt).then((stored) => {
      if (monthlyWriteSequenceRef.current === writeSequence) setMonthlyDraft(stored);
    }).catch((error: unknown) => {
      if (monthlyWriteSequenceRef.current !== writeSequence) return;
      void reconcileMonthlyDraft(writeSequence).catch(() => undefined).finally(() => {
        setStorageError(draftStorageError(error, "작성 중인 월급 계획을 자동 저장하지 못했어요."));
      });
    });
  }, [queueMonthlyDraftSave, reconcileMonthlyDraft]);

  const persistWindfallDraft = useCallback((draft: WindfallFormDraft) => {
    if (!storedProfile) return;
    const writeSequence = ++windfallWriteSequenceRef.current;
    const updatedAt = new Date().toISOString();
    setHasWindfallDraft(true);
    void queueWindfallDraftSave(draft, storedProfile.updatedAt, updatedAt).then((stored) => {
      if (windfallWriteSequenceRef.current === writeSequence) setWindfallDraft(stored);
    }).catch((error: unknown) => {
      if (windfallWriteSequenceRef.current !== writeSequence) return;
      void reconcileWindfallDraft(writeSequence).catch(() => undefined).finally(() => {
        setStorageError(draftStorageError(error, "작성 중인 여윳돈 계획을 자동 저장하지 못했어요."));
      });
    });
  }, [queueWindfallDraftSave, reconcileWindfallDraft, storedProfile]);

  const handleMonthlyCalculated = async (
    input: MonthlyPlanInput,
    result: AllocationResult,
    draft: MonthlyFormDraft,
    step: number,
  ) => {
    const writeSequence = ++monthlyWriteSequenceRef.current;
    let draftReference: DraftWriteReference;
    setHasMonthlyDraft(true);
    try {
      const stored = await queueMonthlyCalculationSave(
        draft,
        step,
        storedProfile?.updatedAt ?? null,
      );
      if (monthlyWriteSequenceRef.current === writeSequence) setMonthlyDraft(stored.draft);
      draftReference = referenceForStoredDraft(stored.draft);
      setStoredProfile(stored.profile);
      if (stored.profileChanged) {
        await reconcileWindfallDraft().catch(() => {
          setStorageError("월급 정보는 저장했지만 여윳돈 초안 상태를 다시 확인하지 못했어요.");
        });
      }
      void requestPersistentStorage().catch(() => false);
    } catch (error: unknown) {
      await reconcileMonthlyDraft(writeSequence).catch(() => undefined);
      if (error instanceof ProfileConflictError) {
        setStorageError(error.message);
      } else {
        setStorageError(draftStorageError(error, "작성 중인 월급 계획을 기기에 저장하지 못했어요."));
      }
      return;
    }
    setSelectedScenarioId(null);
    setActive({ input, result, source: "MONTHLY", draftReference });
    setScreen("RESULT");
    window.scrollTo({ top: 0 });
  };

  const handleWindfallCalculated = async (
    input: WindfallPlanInput,
    result: AllocationResult,
    draft: WindfallFormDraft,
  ) => {
    if (!storedProfile) return;
    const writeSequence = ++windfallWriteSequenceRef.current;
    let draftReference: DraftWriteReference;
    setHasWindfallDraft(true);
    try {
      const stored = await queueWindfallDraftSave(draft, storedProfile.updatedAt);
      if (windfallWriteSequenceRef.current === writeSequence) setWindfallDraft(stored);
      draftReference = referenceForStoredDraft(stored);
    } catch (error: unknown) {
      await reconcileWindfallDraft(writeSequence).catch(() => undefined);
      setStorageError(draftStorageError(
        error,
        "여윳돈 입력을 기기에 저장하지 못했어요. 잠시 후 다시 계산해 주세요.",
      ));
      return;
    }
    setSelectedScenarioId(null);
    setActive({ input, result, source: "WINDFALL", draftReference });
    setScreen("RESULT");
    window.scrollTo({ top: 0 });
  };

  const selectScenario = async (scenarioId: ScenarioId) => {
    if (!active || active.source === "SAVED") return;
    if (!active.draftReference) throw new Error("저장할 초안 기준이 없습니다.");
    let outcome;
    try {
      outcome = await savePlanRun(
        active.input,
        active.result,
        scenarioId,
        active.draftReference,
      );
    } catch (error: unknown) {
      if (error instanceof DraftConflictError) {
        if (active.draftReference.id === "monthly") {
          await reconcileMonthlyDraft().catch(() => undefined);
        } else {
          await reconcileWindfallDraft().catch(() => undefined);
        }
        setStorageError(error.message);
      }
      throw error;
    }
    setLatestPlan(outcome.run);
    setPlanRuns((current) => [outcome.run, ...current]);
    setSelectedScenarioId(scenarioId);
    const reconcile = active.draftReference.id === "monthly"
      ? reconcileMonthlyDraft
      : reconcileWindfallDraft;
    await reconcile().catch(() => {
      setStorageError("계획은 저장했지만 최신 초안 상태를 다시 확인하지 못했어요.");
    });
  };

  const openStoredPlan = (plan: StoredPlanRun) => {
    const selectedExists = plan.result.scenarios.some(
      (scenario) => scenario.scenarioId === plan.selectedScenarioId,
    );
    if (!selectedExists) {
      setStorageError("저장한 계획의 선택 내용을 확인하지 못했어요.");
      return;
    }
    setSelectedScenarioId(plan.selectedScenarioId);
    setActive({
      input: structuredClone(plan.input),
      result: structuredClone(plan.result),
      source: "SAVED",
      savedAt: plan.createdAt,
    });
    setScreen("RESULT");
    window.scrollTo({ top: 0 });
  };

  const deleteStoredPlan = async (plan: StoredPlanRun) => {
    if (dataBusyRef.current) return;
    if (!window.confirm("이 저장 계획을 삭제할까요? 삭제 후에는 복구할 수 없습니다.")) return;
    if (!beginDataOperation()) return;
    try {
      await deletePlanRun(plan.id);
      const remaining = planRuns.filter((stored) => stored.id !== plan.id);
      setPlanRuns(remaining);
      setLatestPlan(remaining[0]);
      setStorageError(null);
    } catch {
      setStorageError("저장 계획을 삭제하지 못했어요.");
    } finally {
      finishDataOperation();
    }
  };

  const goHome = () => {
    setScreen("HOME");
    setActive(null);
    setSelectedScenarioId(null);
    window.scrollTo({ top: 0 });
  };

  const startMonthlyPlan = async () => {
    if (loading || !beginDataOperation()) return;
    try {
      await reconcileMonthlyDraft();
      setScreen("MONTHLY");
    } catch {
      setStorageError("최신 월급 정보와 초안 상태를 확인하지 못했어요.");
    } finally {
      finishDataOperation();
    }
  };

  const startWindfallPlan = async () => {
    if (loading || !beginDataOperation()) return;
    try {
      const context = await reconcileWindfallDraft();
      if (!context.profile) {
        setStorageError("저장된 월급 정보가 없어 여윳돈 계획을 시작할 수 없어요.");
        return;
      }
      setScreen("WINDFALL");
    } catch {
      setStorageError("최신 월급 정보와 여윳돈 초안 상태를 확인하지 못했어요.");
    } finally {
      finishDataOperation();
    }
  };

  const discardMonthlyDraft = async () => {
    if (dataBusyRef.current) return;
    if (!window.confirm("작성 중인 월급 계획만 삭제할까요? 저장한 프로필과 계획 이력은 유지됩니다.")) return;
    if (!beginDataOperation()) return;
    try {
      await deletePlannerDraft("monthly", structuredClone(monthlyReferenceRef.current));
      await reconcileMonthlyDraft();
    } catch (error: unknown) {
      await reconcileMonthlyDraft().catch(() => undefined);
      setStorageError(draftStorageError(error, "작성 중인 월급 계획을 삭제하지 못했어요."));
    } finally {
      finishDataOperation();
    }
  };

  const discardWindfallDraft = async () => {
    if (dataBusyRef.current) return;
    if (!window.confirm("작성 중인 여윳돈 계획만 삭제할까요? 저장한 월급 정보와 계획 이력은 유지됩니다.")) return;
    if (!beginDataOperation()) return;
    try {
      await deletePlannerDraft("windfall", structuredClone(windfallReferenceRef.current));
      await reconcileWindfallDraft();
    } catch (error: unknown) {
      await reconcileWindfallDraft().catch(() => undefined);
      setStorageError(draftStorageError(error, "작성 중인 여윳돈 계획을 삭제하지 못했어요."));
    } finally {
      finishDataOperation();
    }
  };

  const leaveMonthlyPlanner = async (
    draft: MonthlyFormDraft,
    step: number,
    changed: boolean,
  ) => {
    if (changed) {
      const writeSequence = ++monthlyWriteSequenceRef.current;
      setHasMonthlyDraft(true);
      try {
        const stored = await queueMonthlyDraftSave(draft, step);
        if (monthlyWriteSequenceRef.current === writeSequence) setMonthlyDraft(stored);
      } catch (error: unknown) {
        await reconcileMonthlyDraft(writeSequence).catch(() => undefined);
        setStorageError(draftStorageError(error, "작성 중인 월급 계획을 기기에 저장하지 못했어요."));
      }
    }
    goHome();
  };

  const leaveWindfallPlanner = async (draft: WindfallFormDraft, changed: boolean) => {
    if (changed && storedProfile) {
      const writeSequence = ++windfallWriteSequenceRef.current;
      setHasWindfallDraft(true);
      try {
        const stored = await queueWindfallDraftSave(draft, storedProfile.updatedAt);
        if (windfallWriteSequenceRef.current === writeSequence) setWindfallDraft(stored);
      } catch (error: unknown) {
        await reconcileWindfallDraft(writeSequence).catch(() => undefined);
        setStorageError(draftStorageError(error, "작성 중인 여윳돈 계획을 기기에 저장하지 못했어요."));
      }
    }
    goHome();
  };

  const exportData = async () => {
    if (dataBusyRef.current) return;
    try {
      const blob = await exportLocalData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `money-plan-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setStorageError("데이터 파일을 만들지 못했어요.");
    }
  };

  const deleteData = async () => {
    if (dataBusyRef.current) return;
    const confirmed = window.confirm("이 기기에 저장된 월급 입력, 작성 중 초안과 계획 이력을 모두 삭제할까요? 삭제 후에는 복구할 수 없습니다.");
    if (!confirmed) return;
    if (!beginDataOperation()) return;
    try {
      await deleteAllLocalData();
      setStoredProfile(undefined);
      setLatestPlan(undefined);
      setPlanRuns([]);
      await Promise.all([reconcileMonthlyDraft(), reconcileWindfallDraft()]);
      setStorageError(null);
    } catch {
      setStorageError("저장된 데이터를 삭제하지 못했어요.");
    } finally {
      finishDataOperation();
    }
  };

  if (screen === "MONTHLY") {
    return (
      <MonthlyPlanner
        key={monthlyPlannerKey}
        initialProfile={storedProfile?.draft}
        initialDraft={monthlyDraft?.draft}
        initialStep={monthlyDraft?.step}
        restoredDraft={hasMonthlyDraft}
        storageError={storageError}
        onDraftChange={persistMonthlyDraft}
        onCancel={leaveMonthlyPlanner}
        onCalculated={handleMonthlyCalculated}
      />
    );
  }

  if (screen === "WINDFALL" && storedProfile) {
    return (
      <WindfallPlanner
        key={windfallPlannerKey}
        profile={storedProfile.draft}
        initialDraft={windfallDraft?.draft}
        restoredDraft={hasWindfallDraft}
        storageError={storageError}
        onDraftChange={persistWindfallDraft}
        onCancel={leaveWindfallPlanner}
        onCalculated={handleWindfallCalculated}
      />
    );
  }

  if (screen === "RESULT" && active) {
    return (
      <PlanResults
        input={active.input}
        result={active.result}
        selectedScenarioId={selectedScenarioId}
        readOnly={active.source === "SAVED"}
        savedAt={active.savedAt}
        storageError={storageError}
        onBack={active.source === "SAVED"
          ? goHome
          : () => setScreen(active.source === "MONTHLY" ? "MONTHLY" : "WINDFALL")}
        onHome={goHome}
        onSelectScenario={selectScenario}
      />
    );
  }

  return (
    <div className="home-shell" aria-busy={dataBusy}>
      <header className="site-header">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="머니플랜 홈">
          <img src={`${import.meta.env.BASE_URL}money-plan-icon.svg`} alt="" />
          <span>머니플랜</span>
        </a>
        <span className="local-badge">기기 안에만 저장</span>
      </header>

      <main>
        <section className="home-hero">
          <div className="home-hero__copy">
            <span className="eyebrow">월급 들어온 날, 3분 계획</span>
            <h1>내 월급을<br />어떻게 나눌지<br /><em>직접 비교해 보세요.</em></h1>
            <p>월급과 꼭 나가는 돈을 입력하면 비상자금·목표·장기목표의 세 가지 예산 시나리오를 보여드려요.</p>
            <div className="hero-actions">
              <button className="button button--primary button--large" type="button" onClick={startMonthlyPlan} disabled={loading || dataBusy}>
                {hasMonthlyDraft ? "작성 중 월급 계획 이어서" : storedProfile ? "월급 계획 다시 계산" : "월급 계획 만들기"}
              </button>
              {storedProfile ? (
                <button className="button button--secondary button--large" type="button" onClick={startWindfallPlan} disabled={dataBusy}>
                  {hasWindfallDraft ? "작성 중 여윳돈 계획 이어서" : "+ 여윳돈 나누기"}
                </button>
              ) : null}
            </div>
            <p className="hero-disclosure">특정 상품을 추천하거나 수익을 보장하지 않는 교육용 예산 도구입니다.</p>
            {hasMonthlyDraft && monthlyDraft ? (
              <div className="draft-resume-note">
                <span role="status">월급 계획 초안 · {new Date(monthlyDraft.updatedAt).toLocaleString("ko-KR")} 마지막 입력</span>
                <button type="button" disabled={dataBusy} onClick={() => void discardMonthlyDraft()}>초안 삭제</button>
              </div>
            ) : null}
            {hasWindfallDraft && windfallDraft ? (
              <div className="draft-resume-note">
                <span role="status">여윳돈 계획 초안 · {new Date(windfallDraft.updatedAt).toLocaleString("ko-KR")} 마지막 입력</span>
                <button type="button" disabled={dataBusy} onClick={() => void discardWindfallDraft()}>초안 삭제</button>
              </div>
            ) : null}
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="visual-card visual-card--main">
              <span>이번 달 배분 가능액</span>
              <strong>900,000원</strong>
              <div className="demo-bar"><i /><i /><i /><i /></div>
              <ul>
                <li><span>비상자금</span><b>360,000원</b></li>
                <li><span>등록한 목표</span><b>270,000원</b></li>
                <li><span>장기목표</span><b>180,000원</b></li>
                <li><span>직접 결정</span><b>90,000원</b></li>
              </ul>
            </div>
            <div className="visual-note">상품 추천 없이<br /><strong>돈의 용도부터</strong></div>
          </div>
        </section>

        {storageError ? <div className="error-summary home-error" role="alert"><p>{storageError}</p></div> : null}

        {loading ? (
          <section className="dashboard-card dashboard-card--loading"><p>저장된 계획을 확인하고 있어요…</p></section>
        ) : storedProfile || latestPlan ? (
          <section className="dashboard-section" aria-labelledby="dashboard-title">
            <div className="section-heading section-heading--row">
              <div>
                <span className="eyebrow">내 기기의 계획</span>
                <h2 id="dashboard-title">다시 입력하지 않고 이어서</h2>
              </div>
              <span>{storedProfile ? `${new Date(storedProfile.updatedAt).toLocaleDateString("ko-KR")} 수정` : "이 기기의 저장 이력"}</span>
            </div>
            <div className={`dashboard-grid ${storedProfile ? "" : "dashboard-grid--single"}`}>
              {storedProfile ? (
                <article className="dashboard-card">
                  <span>저장된 세후 월급</span>
                  <strong>{formatWon(Number(storedProfile.draft.monthlyNetIncomeWon))}</strong>
                  <dl>
                    <div><dt>비상자금 기준</dt><dd>{storedProfile.draft.emergencyTargetMonths}개월</dd></div>
                    <div><dt>등록한 목표</dt><dd>{storedProfile.draft.goals.length}개</dd></div>
                  </dl>
                  <button className="button button--secondary button--full" type="button" onClick={startMonthlyPlan} disabled={dataBusy}>
                    {hasMonthlyDraft ? "작성 이어가기" : "입력 수정"}
                  </button>
                </article>
              ) : null}
              <article className="dashboard-card dashboard-card--accent">
                <span>최근 저장한 선택</span>
                {latestPlan ? (
                  <>
                    <strong>{scenarioNames[latestPlan.selectedScenarioId]}</strong>
                    <p>{latestPlan.mode === "MONTHLY_SALARY" ? "월급 계획" : "여윳돈 계획"} · <time dateTime={latestPlan.createdAt}>{new Date(latestPlan.createdAt).toLocaleString("ko-KR")}</time></p>
                  </>
                ) : (
                  <><strong>아직 선택 전</strong><p>계산 후 세 안 중 하나를 직접 저장해 주세요.</p></>
                )}
                <div className="dashboard-card__actions">
                  {latestPlan ? (
                    <button className="button button--light button--full" type="button" onClick={() => openStoredPlan(latestPlan)} disabled={dataBusy}>저장한 계획 상세 보기</button>
                  ) : null}
                  {storedProfile ? (
                    <button className="button button--light button--full" type="button" onClick={startWindfallPlan} disabled={dataBusy}>
                      {hasWindfallDraft ? "여윳돈 계획 이어가기" : "여윳돈 추가"}
                    </button>
                  ) : null}
                </div>
              </article>
            </div>
            {planRuns.length > 0 ? (
              <div className="plan-history">
                <div className="section-heading section-heading--row">
                  <div><span className="eyebrow">저장 이력</span><h3>이 기기에 저장한 계획</h3></div>
                  <span>최근 순 · {planRuns.length}개</span>
                </div>
                <ul>
                  {planRuns.map((plan) => (
                    <li key={plan.id} className="dashboard-card">
                      <div>
                        <strong>{scenarioNames[plan.selectedScenarioId]}</strong>
                        <p>{plan.mode === "MONTHLY_SALARY" ? "월급 계획" : "여윳돈 계획"} · <time dateTime={plan.createdAt}>{new Date(plan.createdAt).toLocaleString("ko-KR")}</time></p>
                      </div>
                      <div className="plan-history__actions">
                        <button className="button button--secondary" type="button" disabled={dataBusy} onClick={() => openStoredPlan(plan)}>상세 보기</button>
                        <button className="button button--danger" type="button" disabled={dataBusy} onClick={() => void deleteStoredPlan(plan)}>삭제</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="principles-section" aria-labelledby="principles-title">
          <div className="section-heading">
            <span className="eyebrow">우리가 지키는 선</span>
            <h2 id="principles-title">결정을 대신하지 않고, 계산을 투명하게</h2>
          </div>
          <div className="principle-grid">
            <article><span>01</span><h3>자동 추천 없음</h3><p>세 가지 안을 같은 크기로 보여주고 사용자가 직접 선택합니다.</p></article>
            <article><span>02</span><h3>상품·종목 연결 없음</h3><p>은행 상품이나 ETF를 배분 금액에 자동으로 연결하지 않습니다.</p></article>
            <article><span>03</span><h3>서버 전송 없음</h3><p>월급과 지출 입력은 이 브라우저의 IndexedDB에만 저장됩니다.</p></article>
          </div>
        </section>

        {storedProfile || latestPlan || hasMonthlyDraft || hasWindfallDraft ? (
          <section className="data-controls" aria-labelledby="data-title">
            <div>
              <span className="eyebrow">내 데이터 관리</span>
              <h2 id="data-title">내보내거나 완전히 삭제할 수 있어요.</h2>
              <p>브라우저를 지우면 데이터가 사라질 수 있으니 필요하면 JSON 파일로 보관하세요.</p>
            </div>
            <div>
              <button className="button button--secondary" type="button" disabled={dataBusy} onClick={() => void exportData()}>내 데이터 내보내기</button>
              <button className="button button--danger" type="button" disabled={dataBusy} onClick={() => void deleteData()}>모든 데이터 삭제</button>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        <strong>머니플랜 베타</strong>
        <p>예산 계산·교육용 도구이며 금융상품 취득·처분을 권유하지 않습니다.</p>
      </footer>
      <UpdatePrompt />
    </div>
  );
}
