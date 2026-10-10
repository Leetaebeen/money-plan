import { useState } from "react";
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
  const [kind, setKind] = useState<EntryKind>("EXPENSE");
  const [date, setDate] = useState(today());
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("미분류");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [page, setPage] = useState(0);
  function edit(entry?: Entry) {
    setEditing(entry ?? "new");
    setAccount(entry?.accountId ?? data.accounts[0]?.id ?? "");
    setOther("");
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
  const visible = data.entries
    .filter(
      (e) =>
        (!filter || e.accountId === filter) &&
        (!month || e.date.startsWith(month)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
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
          조회 월
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
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
      {!visible.length ? (
        <Empty>
          조회한 기간에 거래가 없어요. 내역 파일을 가져오거나 직접 입력해
          보세요.
        </Empty>
      ) : (
        <div className="ledger-panel ledger-entry-list">
          {visible.slice(page * 30, page * 30 + 30).map((entry) => (
            <article className="ledger-entry" key={entry.id}>
              <div>
                <span className="ledger-note">
                  {entry.date} ·{" "}
                  {data.accounts.find((a) => a.id === entry.accountId)?.name}
                </span>
                <h3>{entry.description}</h3>
                <span className="ledger-tag">
                  {kinds[entry.kind]} · {entry.category}
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
      {visible.length > 30 && (
        <div className="ledger-actions">
          <button
            className="ledger-btn"
            disabled={!page}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </button>
          <span>
            {page + 1} / {Math.ceil(visible.length / 30)}
          </span>
          <button
            className="ledger-btn"
            disabled={(page + 1) * 30 >= visible.length}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </button>
        </div>
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
