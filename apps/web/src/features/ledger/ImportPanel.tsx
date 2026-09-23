import { useState } from "react";
import {
  fileHash,
  MAX_FILE_BYTES,
  parseCsv,
  prepareRows,
  suggestColumns,
  type ColumnMap,
  type CsvTable,
  type ImportRow,
} from "./csv";
import {
  kinds,
  today,
  won,
  type EntryKind,
  type LedgerSnapshot,
} from "./model";
import { commitImport } from "./store";
import { download } from "./shared";
interface Props {
  snapshot: LedgerSnapshot;
  busy: boolean;
  run: (
    action: () => Promise<LedgerSnapshot>,
    message: string,
  ) => Promise<boolean>;
}
export function ImportPanel({ snapshot, busy, run }: Props) {
  const { data } = snapshot;
  const [accountId, setAccountId] = useState(data.accounts[0]?.id ?? "");
  const [encoding, setEncoding] = useState("utf-8");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [columns, setColumns] = useState<ColumnMap | null>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [hash, setHash] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [page, setPage] = useState(0);
  async function readFile(file?: File) {
    setError("");
    setTable(null);
    setRows(null);
    setColumns(null);
    setHash("");
    if (!file) return;
    setReading(true);
    try {
      if (!/\.(csv|tsv)$/i.test(file.name))
        throw new Error(
          "CSV 또는 TSV 파일을 선택해 주세요. 엑셀은 CSV UTF-8 형식으로 저장해 주세요.",
        );
      if (file.size > MAX_FILE_BYTES)
        throw new Error("5MB 이하 파일만 지원합니다.");
      const bytes = await file.arrayBuffer();
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      const parsed = parseCsv(decoded);
      const digest = await fileHash(bytes);
      setHash(digest);
      setTable(parsed);
      setColumns(suggestColumns(parsed.headers));
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "글자를 읽지 못했어요. 인코딩을 바꾼 뒤 파일을 다시 선택해 주세요."
          : e instanceof Error
            ? e.message
            : "파일을 읽지 못했어요.",
      );
    } finally {
      setReading(false);
    }
  }
  function preview() {
    setError("");
    try {
      const account = data.accounts.find((a) => a.id === accountId);
      if (!account || !table || !columns)
        throw new Error("계좌와 파일을 먼저 선택해 주세요.");
      if (
        data.batches.some((b) => b.hash === hash && b.accountId === accountId)
      )
        throw new Error(
          "이미 이 계좌에 반영한 파일입니다. 수정하려면 가져오기 이력을 먼저 되돌려 주세요.",
        );
      setRows(
        prepareRows(
          table,
          columns,
          accountId,
          data.entries,
          account.openingDate,
          today(),
        ),
      );
      setRevision(snapshot.revision);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "열 설정을 확인해 주세요.");
    }
  }
  function update(index: number, change: Partial<ImportRow>) {
    setRows(
      (old) =>
        old?.map((r, i) => (i === index ? { ...r, ...change } : r)) ?? null,
    );
  }
  const selected = rows?.filter((r) => r.selected && r.entry) ?? [];
  const selectColumn = (key: keyof ColumnMap, label: string) => (
    <label key={key}>
      {label}
      <select
        value={columns?.[key] ?? -1}
        onChange={(e) => {
          setColumns((old) =>
            old ? { ...old, [key]: Number(e.target.value) } : null,
          );
          setRows(null);
        }}
      >
        <option value={-1}>선택 안 함</option>
        {table?.headers.map((h, i) => (
          <option key={i} value={i}>
            {i + 1}. {h || "이름 없음"}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="ledger-panel ledger-form">
      <div className="ledger-section-title">
        <div>
          <h3>거래 파일 가져오기</h3>
          <p>파일은 기기 안에서 읽고, 선택한 거래만 저장해요.</p>
        </div>
        <button
          className="ledger-text-btn"
          type="button"
          onClick={() =>
            download(
              "\uFEFF날짜,내용,금액\r\n",
              "money-plan-template.csv",
              "text/csv;charset=utf-8",
            )
          }
        >
          CSV 양식 받기
        </button>
      </div>
      <fieldset disabled={busy || reading}>
        <div className="ledger-fields">
          <label>
            가져올 계좌
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setRows(null);
              }}
            >
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            파일 인코딩
            <select
              value={encoding}
              onChange={(e) => {
                setEncoding(e.target.value);
                setRows(null);
                setTable(null);
              }}
            >
              <option value="utf-8">UTF-8 (기본)</option>
              <option value="euc-kr">한국어 (EUC-KR)</option>
            </select>
          </label>
          <label className="ledger-wide">
            CSV / TSV 파일
            <input
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void readFile(file);
              }}
            />
          </label>
        </div>
        <p className="ledger-note">
          첫 줄은 열 제목이어야 합니다. 금액 열은 입금 + / 출금 − 부호를
          사용하거나, 입금·출금 두 열을 각각 선택하세요. XLSX·PDF·암호화 파일은
          아직 지원하지 않아요.
        </p>
        {table && columns && (
          <>
            <h4>어떤 열을 가져올까요?</h4>
            <div className="ledger-fields">
              {selectColumn("date", "날짜 열")}
              {selectColumn("description", "거래내용 열")}
              <label>
                금액 형식
                <select
                  value={columns.amount >= 0 ? "signed" : "split"}
                  onChange={(e) => {
                    setColumns({
                      ...columns,
                      amount: e.target.value === "split" ? -1 : 0,
                    });
                    setRows(null);
                  }}
                >
                  <option value="signed">한 열 · 입금 + / 출금 −</option>
                  <option value="split">입금 / 출금 두 열</option>
                </select>
              </label>
              {columns.amount >= 0 ? (
                selectColumn("amount", "부호 있는 금액 열")
              ) : (
                <>
                  {selectColumn("deposit", "입금 열")}
                  {selectColumn("withdrawal", "출금 열")}
                </>
              )}
            </div>
            <p className="ledger-note">
              {table.rows.length.toLocaleString()}개 행 · 계좌 기준일{" "}
              {data.accounts.find((a) => a.id === accountId)?.openingDate} 이후
              거래만 반영할 수 있어요.
            </p>
            <button className="ledger-btn" type="button" onClick={preview}>
              거래 미리보기
            </button>
          </>
        )}
        {reading && <p role="status">파일을 읽고 있어요…</p>}
        {error && (
          <p className="ledger-error" role="alert">
            {error}
          </p>
        )}
        {rows && (
          <>
            <div className="ledger-import-summary" aria-live="polite">
              <b>{selected.length}건 선택</b>
              <span>중복 후보 {rows.filter((r) => r.duplicate).length}건</span>
              <span>오류 {rows.filter((r) => r.error).length}건</span>
            </div>
            <p className="ledger-note">
              날짜·금액·내용이 같은 거래는 중복 후보로 선택 해제했어요. 실제
              반복 결제라면 다시 선택하세요. 내 계좌 사이의 이동은 종류를 ‘계좌
              이동’으로 바꿔 주세요.
            </p>
            <div className="ledger-import-rows">
              {rows.slice(page * 30, page * 30 + 30).map((row, offset) => {
                const index = page * 30 + offset;
                return (
                  <div className="ledger-import-row" key={row.row}>
                    {row.entry ? (
                      <>
                        <label className="ledger-select-row">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) =>
                              update(index, { selected: e.target.checked })
                            }
                          />
                          <span>
                            <b>{row.entry.description}</b>
                            <small>
                              {row.entry.date} · {row.row}행
                              {row.duplicate ? " · 중복 후보" : ""}
                            </small>
                          </span>
                        </label>
                        <b
                          className={
                            row.entry.amount > 0 ? "ledger-positive" : ""
                          }
                        >
                          {row.entry.amount > 0 ? "+" : ""}
                          {won(row.entry.amount)}
                        </b>
                        <label>
                          종류
                          <select
                            value={row.entry.kind}
                            onChange={(e) =>
                              update(index, {
                                entry: {
                                  ...row.entry!,
                                  kind: e.target.value as EntryKind,
                                },
                              })
                            }
                          >
                            {Object.entries(kinds)
                              .filter(([kind]) =>
                                row.entry!.amount > 0
                                  ? kind !== "EXPENSE"
                                  : !["INCOME", "REFUND"].includes(kind),
                              )
                              .map(([kind, label]) => (
                                <option key={kind} value={kind}>
                                  {label}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <p className="ledger-error">
                        {row.row}행: {row.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="ledger-actions">
              <button
                type="button"
                className="ledger-btn"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                이전
              </button>
              <span>
                {page + 1} / {Math.ceil(rows.length / 30)}
              </span>
              <button
                type="button"
                className="ledger-btn"
                disabled={(page + 1) * 30 >= rows.length}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
              </button>
            </div>
            <button
              className="ledger-btn ledger-primary"
              type="button"
              disabled={!selected.length}
              onClick={async () => {
                if (
                  await run(
                    () =>
                      commitImport(
                        revision,
                        accountId,
                        hash,
                        selected.map((r) => r.entry!),
                      ),
                    `${selected.length}건을 반영했어요.`,
                  )
                ) {
                  setRows(null);
                  setTable(null);
                  setColumns(null);
                }
              }}
            >
              선택한 {selected.length}건 반영
            </button>
          </>
        )}
      </fieldset>
    </section>
  );
}
