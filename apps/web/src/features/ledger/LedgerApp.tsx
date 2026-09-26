import { useEffect, useRef, useState } from "react";
import { App as LegacyPlanner } from "../../app/App";
import { UpdatePrompt } from "../../components/UpdatePrompt";
import { balance, today, won, type Ledger, type LedgerSnapshot } from "./model";
import { loadLedger, mutateLedger } from "./store";
import { Accounts } from "./Accounts";
import { Goals, GoalCard } from "./Goals";
import { Transactions } from "./Transactions";
import { BackupPanel } from "./BackupPanel";
import { MonthlyPlan } from "./MonthlyPlan";
import { monthlyMetrics } from "./monthly-plan";
import "./ledger.css";
type Screen =
  | "home"
  | "plan"
  | "transactions"
  | "goals"
  | "accounts"
  | "backup";
const tabs: { id: Screen; label: string; symbol: string }[] = [
  { id: "home", label: "홈", symbol: "⌂" },
  { id: "plan", label: "월급", symbol: "₩" },
  { id: "transactions", label: "거래", symbol: "↔" },
  { id: "goals", label: "목표", symbol: "◎" },
  { id: "accounts", label: "자산", symbol: "▥" },
  { id: "backup", label: "백업", symbol: "↓" },
];
export function LedgerApp() {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [legacy, setLegacy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let mounted = true;
    void loadLedger()
      .then((s) => {
        if (mounted) setSnapshot(s);
      })
      .catch(() => {
        if (mounted)
          setError(
            "저장 공간을 열지 못했어요. 브라우저의 저장 공간 설정을 확인하고 다시 시도해 주세요.",
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [screen]);
  async function run(
    action: () => Promise<LedgerSnapshot>,
    message: string,
  ): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setSnapshot(await action());
      setNotice(message);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "저장하지 못했어요. 다시 시도해 주세요.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function change(fn: (data: Ledger) => void, message = "저장했어요.") {
    if (!snapshot) return false;
    return run(() => mutateLedger(snapshot.revision, fn), message);
  }
  function navigate(next: Screen) {
    setScreen(next);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0 });
  }
  if (legacy)
    return (
      <>
        <div className="ledger-return">
          <button
            onClick={() => {
              setLegacy(false);
              void run(loadLedger, "가계부를 불러왔어요.");
            }}
          >
            ← 내 가계부로 돌아가기
          </button>
        </div>
        <LegacyPlanner />
      </>
    );
  const data = snapshot?.data;
  const monthly = data ? monthlyMetrics(data) : null;
  const known =
    data?.accounts
      .map((a) => balance(a, data.entries))
      .filter((v): v is number => v !== null) ?? [];
  const month = today().slice(0, 7);
  const entries =
    data?.entries.filter(
      (e) => e.date.startsWith(month) && e.date <= today(),
    ) ?? [];
  const spending = -entries
    .filter((e) => e.kind === "EXPENSE" || e.kind === "REFUND")
    .reduce((sum, e) => sum + e.amount, 0);
  const income = entries
    .filter((e) => e.kind === "INCOME")
    .reduce((sum, e) => sum + e.amount, 0);
  const unknown = (data?.accounts.length ?? 0) - known.length;
  return (
    <div className="ledger">
      <a href="#ledger-main" className="skip-link">
        본문으로 건너뛰기
      </a>
      <header className="ledger-header">
        <a className="ledger-brand" href={import.meta.env.BASE_URL}>
          <span className="ledger-brand-icon">m.</span>머니플랜
        </a>
        <span className="ledger-local">
          <span aria-hidden="true">●</span> 이 기기에 저장
        </span>
      </header>
      <div className="ledger-layout">
        <aside className="ledger-desktop-nav" aria-label="주 메뉴">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={screen === tab.id ? "page" : undefined}
              onClick={() => navigate(tab.id)}
            >
              <span aria-hidden="true">{tab.symbol}</span>
              {tab.label}
            </button>
          ))}
          <button
            className="ledger-legacy-link"
            onClick={() => setLegacy(true)}
          >
            이전 월급 계산기 ↗
          </button>
        </aside>
        <main id="ledger-main" className="ledger-main">
          <div className="ledger-page-heading">
            <div>
              <span className="ledger-eyebrow">MY MONEY, MY WAY</span>
              <h1 ref={heading} tabIndex={-1}>
                {screen === "home"
                  ? "모으는 목표가 있는 일상"
                  : tabs.find((t) => t.id === screen)?.label}
              </h1>
            </div>
            <button
              className="ledger-text-btn"
              disabled={busy}
              onClick={() =>
                void run(loadLedger, "최신 저장 내용을 불러왔어요.")
              }
            >
              새로고침
            </button>
          </div>
          {error && (
            <div className="ledger-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="ledger-notice" role="status">
              {notice}
            </div>
          )}
          {!snapshot || !data ? (
            <div className="ledger-empty" role="status">
              {error
                ? "데이터를 불러오지 못했습니다."
                : "내 가계부를 불러오고 있어요…"}
            </div>
          ) : (
            <>
              {screen === "home" && (
                <>
                  <section className="ledger-hero">
                    <div>
                      <span className="ledger-eyebrow">
                        내가 등록한 금융자산
                      </span>
                      <p className="ledger-total">
                        {known.length
                          ? won(known.reduce((sum, v) => sum + v, 0))
                          : "얼마를 모으고 있나요?"}
                      </p>
                      <p>
                        {unknown
                          ? `${unknown}개 계좌의 잔액을 등록하면 자산을 더 정확히 볼 수 있어요.`
                          : "기준 잔액과 기록한 거래를 합한 금액이에요."}
                      </p>
                      <button
                        className="ledger-btn"
                        onClick={() => navigate("accounts")}
                      >
                        {known.length
                          ? "내 계좌 살펴보기 →"
                          : "계좌 잔액 등록하기 →"}
                      </button>
                    </div>
                    <div className="ledger-hero-mark" aria-hidden="true">
                      <span>목표를 향해</span>
                      <b>한 걸음씩.</b>
                      <div className="ledger-steps">
                        <i />
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                  </section>
                  <div className="ledger-metrics">
                    <article>
                      <span>{Number(month.slice(5))}월 수입</span>
                      <strong>{won(income)}</strong>
                      <small>계좌 이동 제외</small>
                    </article>
                    <article>
                      <span>{Number(month.slice(5))}월 순소비</span>
                      <strong>{won(spending)}</strong>
                      <small>지출에서 환불 차감</small>
                    </article>
                    <article>
                      <span>기록된 거래</span>
                      <strong>{entries.length.toLocaleString()}건</strong>
                      <small>이번 달 입력·가져오기 기준</small>
                    </article>
                  </div>
                  <section className="ledger-onboarding ledger-salary-home">
                    <div>
                      <span className="ledger-eyebrow">월급 배분 계획</span>
                      <h3>
                        {monthly
                          ? monthly.deficit
                            ? `계획보다 월 ${won(monthly.deficit)} 부족해요`
                            : `매달 ${won(monthly.savings)} 모으는 계획`
                          : "월급이 들어오면 어디에 얼마를 보낼까요?"}
                      </h3>
                      <p>
                        {monthly
                          ? `미배정 ${won(monthly.unassigned)} · 계좌별 배분과 목표 부족액을 함께 확인하세요.`
                          : "쓸 돈부터 남기고, 적금·청약·ISA·연금으로 모을 돈을 나눠보세요."}
                      </p>
                    </div>
                    <button
                      className="ledger-btn ledger-primary"
                      onClick={() => navigate("plan")}
                    >
                      {monthly ? "배분표 보기 →" : "월급 계획 만들기 →"}
                    </button>
                  </section>
                  <div className="ledger-section-title">
                    <div>
                      <h2>내 목표까지 얼마나 남았을까요?</h2>
                      <p>실제 잔액에서 출발하는 저축 계획</p>
                    </div>
                    <button
                      className="ledger-text-btn"
                      onClick={() => navigate("goals")}
                    >
                      목표 관리 →
                    </button>
                  </div>
                  {data.goals.length ? (
                    <div className="ledger-stack">
                      {data.goals.map((goal) => (
                        <article className="ledger-panel" key={goal.id}>
                          <GoalCard goal={goal} data={data} />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <section className="ledger-onboarding">
                      <div className="ledger-onboarding-number">01</div>
                      <div>
                        <h3>내 첫 목표를 정해볼까요?</h3>
                        <p>
                          모으고 싶은 금액과 날짜를 정하면 매달 필요한 돈을
                          계산해 드려요.
                        </p>
                      </div>
                      <button
                        className="ledger-btn ledger-primary"
                        onClick={() => navigate("goals")}
                      >
                        목표 만들기
                      </button>
                    </section>
                  )}
                  <section className="ledger-bottom-grid">
                    <article className="ledger-panel">
                      <span className="ledger-eyebrow">거래 확인</span>
                      <h3>내역을 가져오고, 가볍게 정리해요</h3>
                      <p>CSV 파일을 확인한 뒤 필요한 거래만 반영하세요.</p>
                      <button
                        className="ledger-text-btn"
                        onClick={() => navigate("transactions")}
                      >
                        거래 관리 →
                      </button>
                    </article>
                    <article className="ledger-panel">
                      <span className="ledger-eyebrow">데이터 보관</span>
                      <h3>휴대폰을 바꿔도 이어서</h3>
                      <p>
                        브라우저 데이터를 지우기 전에 암호화 백업을 저장하세요.
                      </p>
                      <button
                        className="ledger-text-btn"
                        onClick={() => navigate("backup")}
                      >
                        백업하기 →
                      </button>
                    </article>
                  </section>
                  <p className="ledger-note">
                    은행에 자동 연결되지 않습니다. 가져오지 않은 내역·등록하지
                    않은 부채는 집계에 포함되지 않아요. 계좌별 기준일과 최근
                    거래일은 자산에서 확인할 수 있습니다.
                  </p>
                  <button
                    className="ledger-text-btn ledger-mobile-legacy"
                    onClick={() => setLegacy(true)}
                  >
                    이전 월급 계산기 열기 ↗
                  </button>
                </>
              )}
              {screen === "plan" && (
                <MonthlyPlan
                  data={data}
                  busy={busy}
                  change={change}
                  onGoals={() => navigate("goals")}
                  onAccounts={() => navigate("accounts")}
                />
              )}
              {screen === "accounts" && (
                <Accounts data={data} busy={busy} change={change} />
              )}
              {screen === "goals" && (
                <Goals data={data} busy={busy} change={change} />
              )}
              {screen === "transactions" && (
                <Transactions
                  data={data}
                  snapshot={snapshot}
                  busy={busy}
                  change={change}
                  run={run}
                />
              )}
              {screen === "backup" && (
                <BackupPanel snapshot={snapshot} busy={busy} run={run} />
              )}
            </>
          )}
        </main>
      </div>
      <nav className="ledger-mobile-nav" aria-label="주 메뉴">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            aria-current={screen === tab.id ? "page" : undefined}
            onClick={() => navigate(tab.id)}
          >
            <span aria-hidden="true">{tab.symbol}</span>
            {tab.label}
          </button>
        ))}
      </nav>
      <UpdatePrompt />
    </div>
  );
}
