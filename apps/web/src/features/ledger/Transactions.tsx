import { changeTransactionCategories } from "./transaction-edit";
import { possibleDuplicateIds } from "./transaction-search";
import { searchTransactions, transactionPage } from "./transaction-search";
import { SpendingSummary } from "./SpendingSummary";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  kinds,
  money,
  reformatEntryAmount,
  today,
  validDate,
  won,
  type Entry,
  type EntryKind,
  type LedgerSnapshot,
} from "./model";
import { Empty, type PanelProps } from "./shared";
import { ImportPanel } from "./ImportPanel";
import { undoImport } from "./store";
type Props = PanelProps & {
  snapshot: LedgerSnapshot;
  run: (
    action: () => Promise<LedgerSnapshot>,
    message: string,
  ) => Promise<boolean>;
};
export function Transactions({ data, snapshot, busy, change, run }: Props) {
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [account, setAccount] = useState(data.accounts[0]?.id ?? "");
  const [other, setOther] = useState("");
  const [cardBudget, setCardBudget] = useState<"" | "FIXED" | "LIVING">("");
  const [kind, setKind] = useState<EntryKind>("EXPENSE");
  const [date, setDate] = useState(today());
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("미분류");
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const duplicateIds = useMemo(
    () => possibleDuplicateIds(data.entries),
    [data.entries],
  );
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<EntryKind | "">("");
  const [filter, setFilter] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkError, setBulkError] = useState("");
  useEffect(() => {
    setSelectedIds([]);
    setBulkError("");
  }, [page, query, filter, month, kindFilter, duplicatesOnly, categoryFilter]);
  const listRef = useRef<HTMLDivElement>(null);
  function goToPage(next: number) {
    setPage(next);
    listRef.current?.focus();
  }
  function edit(entry?: Entry) {
    setEditing(entry ?? "new");
    setAccount(entry?.accountId ?? data.accounts[0]?.id ?? "");
    setOther("");
    setCardBudget(entry?.cardBudget ?? "");
    setKind(entry?.kind ?? "EXPENSE");
    setDate(entry?.date ?? today());
    setValue(
      entry
        ? String(
            entry.kind === "ADJUSTMENT" || entry.kind === "TRANSFER"
              ? entry.amount
              : Math.abs(entry.amount),
          )
        : "",
    );
    setDescription(entry?.description ?? "");
    setCategory(entry?.category ?? "미분류");
    setError("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!validDate(date) || date > today())
        throw new Error("오늘까지의 실제 거래 날짜를 입력해 주세요.");
      const source = data.accounts.find((a) => a.id === account);
      if (!source || date < source.openingDate)
        throw new Error("계좌의 잔액 기준일 이후 거래를 입력해 주세요.");
      const editingImported =
        typeof editing === "object" &&
        editing !== null &&
        editing.batchId !== null;
      const transfer = kind === "TRANSFER" && !editingImported;
      const parsed = money(
        value,
        kind === "ADJUSTMENT" || (kind === "TRANSFER" && editingImported),
      );
      const amount =
        kind === "EXPENSE" || transfer ? -Math.abs(parsed) : parsed;
      const target = data.accounts.find((a) => a.id === other);
      if (
        transfer &&
        (!target || other === account || date < target.openingDate)
      )
        throw new Error("다른 받는 계좌를 선택하고 기준일을 확인해 주세요.");
      const pairId = transfer ? crypto.randomUUID() : null;
      const entry: Entry = {
        id:
          typeof editing === "object" && editing
            ? editing.id
            : crypto.randomUUID(),
        accountId: account,
        date,
        amount,
        kind,
        description: description.trim(),
        category: category.trim() || "미분류",
        ...(source.role === "CREDIT_CARD" &&
        (kind === "EXPENSE" || kind === "REFUND") &&
        cardBudget
          ? { cardBudget }
          : {}),
        batchId: editingImported ? editing.batchId : null,
        pairId,
      };
      if (
        await change((next) => {
          const old = next.entries.find((e) => e.id === entry.id);
          if (old?.pairId)
            next.entries = next.entries.filter((e) => e.pairId !== old.pairId);
          const index = next.entries.findIndex((e) => e.id === entry.id);
          if (index < 0) next.entries.push(entry);
          else next.entries[index] = entry;
          if (transfer)
            next.entries.push({
              ...entry,
              id: crypto.randomUUID(),
              accountId: other,
              amount: -amount,
            });
        }, "거래를 저장했어요.")
      )
        setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    }
  }
  const baseVisible = useMemo(
    () =>
      searchTransactions(
        duplicatesOnly
          ? data.entries.filter((e) => duplicateIds.has(e.id))
          : data.entries,
        {
          month,
          accountId: filter,
          kind: kindFilter,
          query,
        },
      ),
    [
      data.entries,
      filter,
      month,
      kindFilter,
      query,
      duplicatesOnly,
      duplicateIds,
    ],
  );
  const visible = categoryFilter
    ? baseVisible.filter(
        (e) =>
          (e.kind === "EXPENSE" || e.kind === "REFUND") &&
          e.date <= today() &&
          (e.category.trim() || "미분류") === categoryFilter,
      )
    : baseVisible;
  const pageView = transactionPage(visible, page);
  const selectable = pageView.entries.filter(
    (entry) => entry.kind === "EXPENSE" || entry.kind === "REFUND",
  );
  const activeIds = selectedIds.filter((id) =>
    selectable.some((entry) => entry.id === id),
  );
  useEffect(() => {
    if (page !== pageView.page) setPage(pageView.page);
  }, [page, pageView.page]);
  const imported =
    typeof editing === "object" && editing !== null && editing.batchId !== null;
  return (
    <section>
      <div className="ledger-section-title">
        <div>
          <h2>돈의 흐름을 기록해요</h2>
          <p>내 계좌 사이의 이동은 소비에 포함하지 않아요.</p>
        </div>
        <div className="ledger-actions">
          <button
            className="ledger-btn"
            disabled={busy || !data.accounts.length}
            onClick={() => edit()}
          >
            + 직접 입력
          </button>
          <button
            className="ledger-btn ledger-primary"
            disabled={busy || !data.accounts.length}
            onClick={() => setShowImport((s) => !s)}
          >
            {showImport ? "가져오기 닫기" : "파일 가져오기"}
          </button>
        </div>
      </div>
      <p className="ledger-note">
        신용카드 사용은 카드 계좌의 지출, 환불은 카드 계좌의 환불로 입력해요.
        카드대금 결제·대출 원금 상환은 은행 계좌 → 카드·대출 계좌 이동으로, 대출
        실행은 대출 → 입금 계좌 이동으로 기록해요. 이자·수수료는 별도 지출로
        입력하세요. 기존 결제대금을 지출로 기록했다면 계좌 이동으로 수정해야
        중복 소비가 사라집니다.
      </p>
      {showImport && <ImportPanel snapshot={snapshot} busy={busy} run={run} />}
      {editing && (
        <form className="ledger-panel ledger-form" onSubmit={save}>
          <h3>{editing === "new" ? "거래 입력" : "거래 수정"}</h3>
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                계좌
                <select
                  disabled={imported}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  {data.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                종류
                <select
                  value={kind}
                  onChange={(e) => {
                    const nextKind = e.target.value as EntryKind;
                    setValue(
                      reformatEntryAmount(value, kind, nextKind, imported),
                    );
                    setKind(nextKind);
                  }}
                >
                  {Object.entries(kinds).map(([k, label]) => (
                    <option value={k} key={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {data.accounts.find((a) => a.id === account)?.role ===
                "CREDIT_CARD" &&
                (kind === "EXPENSE" || kind === "REFUND") && (
                  <label>
                    카드 소비 예산
                    <select
                      value={cardBudget}
                      onChange={(e) =>
                        setCardBudget(e.target.value as "" | "FIXED" | "LIVING")
                      }
                    >
                      <option value="">미분류 (남은 예산 계산 보류)</option>
                      <option value="FIXED">고정비</option>
                      <option value="LIVING">생활비</option>
                    </select>
                    <span className="ledger-note">
                      환불은 원래 소비와 같은 예산으로 선택하세요. 결제대금
                      이체는 소비에 포함하지 않아요.
                    </span>
                  </label>
                )}
              {kind === "TRANSFER" && !imported && (
                <label>
                  받는 계좌
                  <select
                    required
                    value={other}
                    onChange={(e) => setOther(e.target.value)}
                  >
                    <option value="">계좌 선택</option>
                    {data.accounts
                      .filter((a) => a.id !== account)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label>
                거래 날짜
                <input
                  type="date"
                  required
                  max={today()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                {kind === "ADJUSTMENT" || (kind === "TRANSFER" && imported)
                  ? "증감액 (원, 감소는 −)"
                  : "금액 (원)"}
                <input
                  required
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <label>
                내용
                <input
                  required
                  maxLength={160}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="예: 급여, 점심 식사"
                />
              </label>
              <label>
                분류
                <input
                  maxLength={60}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  list="ledger-categories"
                />
                <datalist id="ledger-categories">
                  {[
                    "미분류",
                    "급여",
                    "식비",
                    "교통",
                    "주거",
                    "구독",
                    "쇼핑",
                    "저축",
                    "투자",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </label>
            </div>
            {kind === "TRANSFER" && (
              <p className="ledger-note">
                {imported
                  ? "파일 거래는 이 계좌의 한쪽 기록만 변경합니다. 상대 계좌 거래도 가져와 계좌 이동으로 분류해 주세요."
                  : "보내는 계좌와 받는 계좌에 각각 기록합니다. 이미 가져온 이체는 새로 입력하지 말고 기존 거래 종류를 바꾸세요."}
              </p>
            )}
            {kind === "ADJUSTMENT" && (
              <p className="ledger-note">
                평가손익 등 잔액 차이만 입력하세요. 현재 잔액 전체를 입력하는
                칸이 아닙니다.
              </p>
            )}
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">거래 저장</button>
              <button
                type="button"
                className="ledger-btn"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <div className="ledger-filters">
        <label>
          거래 검색
          <input
            type="search"
            maxLength={100}
            value={query}
            placeholder="가맹점·메모·카테고리"
            onChange={(e) => {
              setQuery(e.target.value);
              setCategoryFilter("");
              setPage(0);
            }}
          />
        </label>
        <label>
          거래 종류
          <select
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value as EntryKind | "");
              setCategoryFilter("");
              setPage(0);
            }}
          >
            <option value="">모든 종류</option>
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          조회 월
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setCategoryFilter("");
              setPage(0);
            }}
          />
        </label>
        <label>
          계좌
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setCategoryFilter("");
              setPage(0);
            }}
          >
            <option value="">모든 계좌</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="ledger-note" role="status">
        검색·필터 결과 {visible.length}건 · 공백으로 나눈 검색어를 모두 포함하는
        거래를 찾습니다.{" "}
        <button
          className="ledger-text-btn"
          onClick={() => {
            setQuery("");
            setKindFilter("");
            setDuplicatesOnly(false);
            setFilter("");
            setCategoryFilter("");
            setPage(0);
          }}
        >
          필터 초기화 (조회 월 유지)
        </button>
      </p>
      <label className="ledger-checkbox">
        <input
          type="checkbox"
          checked={duplicatesOnly}
          onChange={(e) => {
            setDuplicatesOnly(e.target.checked);
            setCategoryFilter("");
            setPage(0);
          }}
        />
        중복 의심 거래만 보기 (전체 기록 {duplicateIds.size}건)
      </label>
      {(duplicatesOnly || duplicateIds.size > 0) && (
        <p className="ledger-note">
          같은 계좌·날짜·종류·금액·설명의 수입·지출·환불을 중복 의심으로
          표시합니다. 실제 반복 결제일 수 있으니 내역을 확인한 후
          수정·삭제하세요. 이체와 잔액 조정은 검사하지 않습니다. 합계는 현재
          조회 조건에 맞는 거래만 포함합니다.
        </p>
      )}
      <SpendingSummary
        entries={baseVisible}
        selected={categoryFilter}
        onSelect={(category) => {
          setCategoryFilter(category);
          setPage(0);
        }}
      />
      {!!selectable.length && (
        <form
          className="ledger-panel ledger-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBulkError("");
            try {
              if (
                await change(
                  (next) =>
                    changeTransactionCategories(next, activeIds, bulkCategory),
                  `${activeIds.length}건의 카테고리를 변경했어요.`,
                )
              ) {
                setSelectedIds([]);
                setBulkCategory("");
              }
            } catch (e) {
              setBulkError(
                e instanceof Error
                  ? e.message
                  : "선택과 카테고리를 확인해 주세요.",
              );
            }
          }}
        >
          <fieldset disabled={busy}>
            <h3>선택한 거래 분류</h3>
            <p className="ledger-note">
              현재 페이지의 지출·환불만 선택할 수 있습니다. 검색·필터·페이지를
              바꾸면 선택이 해제됩니다. 금액·계좌·카드 예산 구분은 바꾸지
              않습니다.
            </p>
            <div className="ledger-actions">
              <button
                type="button"
                className="ledger-text-btn"
                onClick={() =>
                  setSelectedIds(selectable.map((entry) => entry.id))
                }
              >
                이 페이지 지출·환불 선택
              </button>
              <button
                type="button"
                className="ledger-text-btn"
                onClick={() => setSelectedIds([])}
              >
                선택 해제
              </button>
              <span>{activeIds.length}건 선택</span>
            </div>
            <label>
              변경할 카테고리
              <input
                required
                maxLength={60}
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                placeholder="예: 식비"
              />
            </label>
            <button
              className="ledger-btn ledger-primary"
              disabled={!activeIds.length || !bulkCategory.trim()}
            >
              선택한 {activeIds.length}건 분류 변경
            </button>
            {bulkError && (
              <p className="ledger-error" role="alert">
                {bulkError}
              </p>
            )}
          </fieldset>
        </form>
      )}
      {!visible.length ? (
        <Empty>
          선택한 조회 조건에 거래가 없어요. 검색어·조회 월·필터를 확인하거나
          거래를 입력해 주세요.
        </Empty>
      ) : (
        <div
          ref={listRef}
          tabIndex={-1}
          aria-label="검색된 거래 목록"
          className="ledger-panel ledger-entry-list"
        >
          {pageView.entries.map((entry) => (
            <article className="ledger-entry" key={entry.id}>
              <div>
                <span className="ledger-note">
                  {entry.date} ·{" "}
                  {data.accounts.find((a) => a.id === entry.accountId)?.name}
                </span>
                {(entry.kind === "EXPENSE" || entry.kind === "REFUND") && (
                  <label className="ledger-checkbox">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={activeIds.includes(entry.id)}
                      onChange={(e) =>
                        setSelectedIds((ids) =>
                          e.target.checked
                            ? [...ids.filter((id) => id !== entry.id), entry.id]
                            : ids.filter((id) => id !== entry.id),
                        )
                      }
                    />
                    {entry.description} 선택
                  </label>
                )}
                <h3>{entry.description}</h3>
                <span className="ledger-tag">
                  {kinds[entry.kind]} · {entry.category}
                  {duplicateIds.has(entry.id) && " · 중복 의심"}
                  {data.accounts.find((a) => a.id === entry.accountId)?.role ===
                    "CREDIT_CARD" &&
                    (entry.kind === "EXPENSE" || entry.kind === "REFUND") &&
                    ` · ${entry.cardBudget === "FIXED" ? "고정비 예산" : entry.cardBudget === "LIVING" ? "생활비 예산" : "예산 미분류"}`}
                </span>
              </div>
              <div className="ledger-entry-end">
                <b className={entry.amount > 0 ? "ledger-positive" : ""}>
                  {entry.amount > 0 ? "+" : ""}
                  {won(entry.amount)}
                </b>
                <div className="ledger-actions">
                  <button
                    className="ledger-text-btn"
                    disabled={busy}
                    onClick={() => {
                      edit(entry);
                      if (entry.pairId) {
                        setAccount(
                          data.entries.find(
                            (e) => e.pairId === entry.pairId && e.amount < 0,
                          )?.accountId ?? entry.accountId,
                        );
                        setOther(
                          data.entries.find(
                            (e) => e.pairId === entry.pairId && e.amount > 0,
                          )?.accountId ?? "",
                        );
                        setValue(String(Math.abs(entry.amount)));
                      }
                    }}
                  >
                    수정
                  </button>
                  <button
                    className="ledger-text-btn"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          entry.pairId
                            ? "이체 양쪽 거래를 삭제할까요?"
                            : "이 거래를 삭제할까요?",
                        )
                      )
                        void change((next) => {
                          next.entries = next.entries.filter((e) =>
                            entry.pairId
                              ? e.pairId !== entry.pairId
                              : e.id !== entry.id,
                          );
                        }, "거래를 삭제했어요.");
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {!!visible.length && (
        <p className="ledger-note" role="status">
          {visible.length}건 중 {pageView.from}~{pageView.to}건 표시
        </p>
      )}
      {pageView.pages > 1 && (
        <nav className="ledger-actions" aria-label="거래 목록 페이지">
          <button
            className="ledger-btn"
            disabled={pageView.page === 0}
            onClick={() => goToPage(0)}
          >
            처음
          </button>
          <button
            className="ledger-btn"
            disabled={pageView.page === 0}
            onClick={() => goToPage(pageView.page - 1)}
          >
            이전
          </button>
          <span>
            {pageView.page + 1} / {pageView.pages}
          </span>
          <button
            className="ledger-btn"
            disabled={pageView.page === pageView.pages - 1}
            onClick={() => goToPage(pageView.page + 1)}
          >
            다음
          </button>
          <button
            className="ledger-btn"
            disabled={pageView.page === pageView.pages - 1}
            onClick={() => goToPage(pageView.pages - 1)}
          >
            마지막
          </button>
        </nav>
      )}
      {!!data.batches.length && (
        <details className="ledger-panel">
          <summary>파일 가져오기 이력 · {data.batches.length}회</summary>
          {[...data.batches]
            .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
            .map((batch) => (
              <div className="ledger-history-row" key={batch.id}>
                <span>
                  {data.accounts.find((a) => a.id === batch.accountId)?.name}
                  <small>
                    {new Date(batch.importedAt).toLocaleString("ko-KR")} · 최초{" "}
                    {batch.rowCount}건
                  </small>
                </span>
                <button
                  className="ledger-btn"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "이 파일에서 가져온 거래를 모두 제거할까요? 가져온 뒤 수정한 거래도 제거됩니다.",
                      )
                    )
                      void run(
                        () => undoImport(snapshot.revision, batch.id),
                        "가져오기를 되돌렸어요.",
                      );
                  }}
                >
                  되돌리기
                </button>
              </div>
            ))}
        </details>
      )}
    </section>
  );
}
