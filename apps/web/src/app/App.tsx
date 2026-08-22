import { useEffect, useState } from "react";
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
  type ProfileDraft,
  type WindfallFormDraft,
} from "../domain/plan-form";
import { MonthlyPlanner } from "../features/monthly/MonthlyPlanner";
import { PlanResults } from "../features/results/PlanResults";
import { WindfallPlanner } from "../features/windfall/WindfallPlanner";
import {
  deleteAllLocalData,
  exportLocalData,
  loadLatestPlan,
  loadProfile,
  requestPersistentStorage,
  savePlanRun,
  saveProfile,
  type StoredPlanRun,
  type StoredProfile,
} from "../persistence/db";
import { scenarioNames } from "../presentation/messages.ko";

type Screen = "HOME" | "MONTHLY" | "WINDFALL" | "RESULT";

interface ActiveCalculation {
  input: AllocationInput;
  result: AllocationResult;
  source: "MONTHLY" | "WINDFALL";
}

export function App() {
  const [screen, setScreen] = useState<Screen>("HOME");
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storedProfile, setStoredProfile] = useState<StoredProfile | undefined>();
  const [latestPlan, setLatestPlan] = useState<StoredPlanRun | undefined>();
  const [active, setActive] = useState<ActiveCalculation | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<ScenarioId | null>(null);
  const [monthlyDraft, setMonthlyDraft] = useState<MonthlyFormDraft | undefined>();
  const [windfallDraft, setWindfallDraft] = useState<WindfallFormDraft | undefined>();

  useEffect(() => {
    let mounted = true;
    void Promise.all([loadProfile(), loadLatestPlan()])
      .then(([profile, plan]) => {
        if (!mounted) return;
        setStoredProfile(profile);
        setLatestPlan(plan);
      })
      .catch(() => {
        if (mounted) setStorageError("기기에 저장된 계획을 불러오지 못했어요.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleMonthlyCalculated = async (
    input: MonthlyPlanInput,
    result: AllocationResult,
    draft: MonthlyFormDraft,
  ) => {
    setMonthlyDraft(structuredClone(draft));
    try {
      const profile = await saveProfile(draft.profile);
      setStoredProfile(profile);
      void requestPersistentStorage();
    } catch {
      setStorageError("입력값을 기기에 저장하지 못했어요. 계산 결과는 계속 확인할 수 있어요.");
    }
    setSelectedScenarioId(null);
    setActive({ input, result, source: "MONTHLY" });
    setScreen("RESULT");
    window.scrollTo({ top: 0 });
  };

  const handleWindfallCalculated = (
    input: WindfallPlanInput,
    result: AllocationResult,
    draft: WindfallFormDraft,
  ) => {
    setWindfallDraft(structuredClone(draft));
    setSelectedScenarioId(null);
    setActive({ input, result, source: "WINDFALL" });
    setScreen("RESULT");
    window.scrollTo({ top: 0 });
  };

  const selectScenario = async (scenarioId: ScenarioId) => {
    if (!active) return;
    const run = await savePlanRun(active.input, active.result, scenarioId);
    setLatestPlan(run);
    setSelectedScenarioId(scenarioId);
  };

  const goHome = () => {
    setScreen("HOME");
    setActive(null);
    setSelectedScenarioId(null);
    window.scrollTo({ top: 0 });
  };

  const startMonthlyPlan = () => {
    setMonthlyDraft(undefined);
    setScreen("MONTHLY");
  };

  const startWindfallPlan = () => {
    setWindfallDraft(undefined);
    setScreen("WINDFALL");
  };

  const exportData = async () => {
    try {
      const blob = await exportLocalData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `money-plan-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setStorageError("데이터 파일을 만들지 못했어요.");
    }
  };

  const deleteData = async () => {
    const confirmed = window.confirm("이 기기에 저장된 월급 입력과 계획 이력을 모두 삭제할까요? 삭제 후에는 복구할 수 없습니다.");
    if (!confirmed) return;
    try {
      await deleteAllLocalData();
      setStoredProfile(undefined);
      setLatestPlan(undefined);
      setMonthlyDraft(undefined);
      setWindfallDraft(undefined);
      setStorageError(null);
    } catch {
      setStorageError("저장된 데이터를 삭제하지 못했어요.");
    }
  };

  if (screen === "MONTHLY") {
    return (
      <MonthlyPlanner
        initialProfile={storedProfile?.draft}
        initialDraft={monthlyDraft}
        onCancel={goHome}
        onCalculated={(input, result, draft) => void handleMonthlyCalculated(input, result, draft)}
      />
    );
  }

  if (screen === "WINDFALL" && storedProfile) {
    return (
      <WindfallPlanner
        profile={storedProfile.draft}
        initialDraft={windfallDraft}
        onCancel={goHome}
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
        onBack={() => setScreen(active.source === "MONTHLY" ? "MONTHLY" : "WINDFALL")}
        onHome={goHome}
        onSelectScenario={selectScenario}
      />
    );
  }

  return (
    <div className="home-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="머니플랜 홈">
          <img src="/money-plan-icon.svg" alt="" />
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
              <button className="button button--primary button--large" type="button" onClick={startMonthlyPlan}>
                {storedProfile ? "월급 계획 다시 계산" : "월급 계획 만들기"}
              </button>
              {storedProfile ? (
                <button className="button button--secondary button--large" type="button" onClick={startWindfallPlan}>
                  + 여윳돈 나누기
                </button>
              ) : null}
            </div>
            <p className="hero-disclosure">특정 상품을 추천하거나 수익을 보장하지 않는 교육용 예산 도구입니다.</p>
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
        ) : storedProfile ? (
          <section className="dashboard-section" aria-labelledby="dashboard-title">
            <div className="section-heading section-heading--row">
              <div>
                <span className="eyebrow">내 기기의 계획</span>
                <h2 id="dashboard-title">다시 입력하지 않고 이어서</h2>
              </div>
              <span>{new Date(storedProfile.updatedAt).toLocaleDateString("ko-KR")} 수정</span>
            </div>
            <div className="dashboard-grid">
              <article className="dashboard-card">
                <span>저장된 세후 월급</span>
                <strong>{formatWon(Number(storedProfile.draft.monthlyNetIncomeWon))}</strong>
                <dl>
                  <div><dt>비상자금 기준</dt><dd>{storedProfile.draft.emergencyTargetMonths}개월</dd></div>
                  <div><dt>등록한 목표</dt><dd>{storedProfile.draft.goals.length}개</dd></div>
                </dl>
                <button className="button button--secondary button--full" type="button" onClick={startMonthlyPlan}>입력 수정</button>
              </article>
              <article className="dashboard-card dashboard-card--accent">
                <span>최근 저장한 선택</span>
                {latestPlan ? (
                  <>
                    <strong>{scenarioNames[latestPlan.selectedScenarioId]}</strong>
                    <p>{latestPlan.mode === "MONTHLY_SALARY" ? "월급 계획" : "여윳돈 계획"} · {new Date(latestPlan.createdAt).toLocaleDateString("ko-KR")}</p>
                  </>
                ) : (
                  <><strong>아직 선택 전</strong><p>계산 후 세 안 중 하나를 직접 저장해 주세요.</p></>
                )}
                <button className="button button--light button--full" type="button" onClick={startWindfallPlan}>여윳돈 추가</button>
              </article>
            </div>
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

        {storedProfile ? (
          <section className="data-controls" aria-labelledby="data-title">
            <div>
              <span className="eyebrow">내 데이터 관리</span>
              <h2 id="data-title">내보내거나 완전히 삭제할 수 있어요.</h2>
              <p>브라우저를 지우면 데이터가 사라질 수 있으니 필요하면 JSON 파일로 보관하세요.</p>
            </div>
            <div>
              <button className="button button--secondary" type="button" onClick={() => void exportData()}>내 데이터 내보내기</button>
              <button className="button button--danger" type="button" onClick={() => void deleteData()}>모든 데이터 삭제</button>
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
