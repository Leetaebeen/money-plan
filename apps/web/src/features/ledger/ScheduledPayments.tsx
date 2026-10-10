import { useState } from "react";
import { money, today, won, type PaymentSchedule } from "./model";
import {
  updateOneTimePayment,
  paymentCandidates,
  recordScheduledPayment,
  scheduleMonth,
} from "./schedules";
import type { PanelProps } from "./shared";

export function ScheduledPayments({ data, busy, change }: PanelProps) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [editing, setEditing] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const editSchedule = (schedule: PaymentSchedule) => {
    setEditing(schedule.id);
    setEditDate(schedule.startDate);
    setEditAmount(String(schedule.amount));
    setSelection(null);
    setAdding(false);
    setError("");
  };
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [accountId, setAccount] = useState(data.accounts[0]?.id ?? "");
  const [target, setTarget] = useState("");
  const [day, setDay] = useState("25");
  const [startDate, setStart] = useState(today());
  const [endDate, setEnd] = useState("");
  const [selection, setSelection] = useState<{
    id: string;
    dueDate: string;
  } | null>(null);
  const [mode, setMode] = useState("link");
  const [entryId, setEntry] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState("");
  const rows = scheduleMonth(data, month);
  const selected = data.schedules.find((s) => s.id === selection?.id);
  const candidates = selected ? paymentCandidates(data, selected) : [];
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const schedule: PaymentSchedule = {
        id: crypto.randomUUID(),
        name: name.trim(),
        amount: money(value),
        accountId,
        targetAccountId: target || null,
        day: Number(day),
        startDate,
        endDate: endDate || null,
        payments: [],
      };
      if (
        await change((next) => {
          next.schedules.push(schedule);
        }, "납부 일정을 등록했어요. 실제 거래는 납부할 때 기록하세요.")
      ) {
        setAdding(false);
        setName("");
        setValue("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    }
  }
  return (
    <section className="ledger-panel" aria-label="매월 납부 일정">
      <div className="ledger-section-title">
        <h3>고정비·적금·카드 납부 일정</h3>
        <button
          className="ledger-btn"
          disabled={busy}
          onClick={() => {
            setAdding(!adding);
            setEditing(null);
            setError("");
          }}
        >
          일정 {adding ? "닫기" : "추가"}
        </button>
      </div>
      <p className="ledger-note">
        자동이체 예정일을 기록하는 기능입니다. 실제 은행 송금은 실행하지
        않습니다. 이미 입력한 거래는 기존 거래 연결을 사용하세요.
      </p>
      {adding && (
        <form className="ledger-form" onSubmit={add}>
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                납부 이름
                <input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="통신비, 적금 납입 등"
                />
              </label>
              <label>
                매달 금액 (원)
                <input
                  required
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <label>
                돈이 나갈 계좌
                <select
                  required
                  value={accountId}
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
                납부 방식
                <select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">외부 지출 (통신비·월세 등)</option>
                  {data.accounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        내 계좌로 이동: {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                매월 예정일
                <select value={day} onChange={(e) => setDay(e.target.value)}>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
              </label>
              <label>
                반복 시작일
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                  value={startDate}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                반복 종료일 (선택)
                <input
                  type="date"
                  min={startDate}
                  max="2099-12-31"
                  value={endDate}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            <p className="ledger-note">
              시작일~종료일 안의 예정일에 매월 반복합니다. 29~31일이 없는 달은
              말일이며 휴일 조정은 하지 않습니다. 월급 계획에 이미 포함한 금액을
              다시 더하지 마세요.
            </p>
            <button className="ledger-btn ledger-primary">일정 저장</button>
          </fieldset>
        </form>
      )}
      {editing && (
        <form
          className="ledger-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              const amount = money(editAmount);
              if (
                await change(
                  (next) =>
                    updateOneTimePayment(next, editing, editDate, amount),
                  "결제 예정을 수정했어요. 실제 거래와 다른 회차는 그대로예요.",
                )
              ) {
                setMonth(editDate.slice(0, 7));
                setEditing(null);
              }
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "입력을 확인해 주세요.",
              );
            }
          }}
        >
          <h4>
            {data.schedules.find((s) => s.id === editing)?.name} · 결제 예정
            수정
          </h4>
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                예정 금액 (원)
                <input
                  autoFocus
                  required
                  inputMode="numeric"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                />
              </label>
              <label>
                결제 예정일
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </label>
            </div>
            <p className="ledger-note">
              선택한 회차만 변경합니다. 다른 할부 회차나 실제 거래 금액은
              자동으로 조정하지 않아요.
            </p>
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">변경 저장</button>
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
      <label className="ledger-actual-month">
        일정 조회 월
        <input
          type="month"
          min="2000-01"
          max="2099-12"
          value={month}
          onChange={(e) => {
            try {
              scheduleMonth(data, e.target.value);
              setMonth(e.target.value);
              setSelection(null);
              setError("");
            } catch {
              setError("조회 월을 선택해 주세요.");
            }
          }}
        />
      </label>
      <dl className="ledger-budget-breakdown">
        <div>
          <dt>거래 미연결 예정 지출</dt>
          <dd>
            {won(
              rows
                .filter((r) => !r.payment && !r.schedule.targetAccountId)
                .reduce((n, r) => n + r.schedule.amount, 0),
            )}
          </dd>
        </div>
        <div>
          <dt>거래 미연결 예정 계좌 이동</dt>
          <dd>
            {won(
              rows
                .filter((r) => !r.payment && r.schedule.targetAccountId)
                .reduce((n, r) => n + r.schedule.amount, 0),
            )}
          </dd>
        </div>
      </dl>
      <p className="ledger-note">
        이달 등록한 카드 결제 예정액{" "}
        {won(
          rows
            .filter(
              (r) =>
                data.accounts.find((a) => a.id === r.schedule.targetAccountId)
                  ?.role === "CREDIT_CARD",
            )
            .reduce((sum, r) => sum + r.schedule.amount, 0),
        )}{" "}
        · 거래 미연결{" "}
        {won(
          rows
            .filter(
              (r) =>
                !r.payment &&
                data.accounts.find((a) => a.id === r.schedule.targetAccountId)
                  ?.role === "CREDIT_CARD",
            )
            .reduce((sum, r) => sum + r.schedule.amount, 0),
        )}
      </p>
      {!rows.length && (
        <p className="ledger-note">이달에 해당하는 납부 일정이 없습니다.</p>
      )}
      <div className="ledger-stack">
        {rows.map(({ schedule: s, dueDate, payment, status }) => (
          <article className="ledger-funding-goal" key={s.id}>
            <h4>
              {s.name} · {won(s.amount)}
            </h4>
            <p>
              {dueDate} ·{" "}
              {payment
                ? "납부 기록 연결됨"
                : status === "overdue"
                  ? "기한 지남 · 거래 미연결"
                  : status === "today"
                    ? "오늘 예정 · 거래 미연결"
                    : "납부 예정"}
            </p>
            <p className="ledger-note">
              {data.accounts.find((a) => a.id === s.accountId)?.name} →{" "}
              {s.targetAccountId
                ? data.accounts.find((a) => a.id === s.targetAccountId)?.name
                : "외부 지출"}
              {payment &&
                ` · 실제 거래일 ${data.entries.find((e) => e.id === payment.entryId)?.date}`}
            </p>
            {s.startDate === s.endDate && !s.payments.length && (
              <button
                className="ledger-text-btn"
                disabled={busy}
                onClick={() => editSchedule(s)}
              >
                예정 금액·날짜 수정
              </button>
            )}
            {!payment ? (
              <button
                className="ledger-btn"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setSelection({ id: s.id, dueDate });
                  setEntry("");
                  setDate(today());
                  setMode("link");
                  setError("");
                }}
              >
                납부 거래 연결·기록
              </button>
            ) : (
              <button
                className="ledger-text-btn"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "일정과의 연결만 해제할까요? 실제 거래와 잔액은 유지됩니다.",
                    )
                  )
                    void change((next) => {
                      const schedule = next.schedules.find(
                        (item) => item.id === s.id,
                      )!;
                      schedule.payments = schedule.payments.filter(
                        (p) => p.dueDate !== dueDate,
                      );
                    }, "납부 연결을 해제했어요. 실제 거래는 유지됩니다.");
                }}
              >
                연결 해제
              </button>
            )}
          </article>
        ))}
      </div>
      {selected && selection && (
        <form
          className="ledger-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            if (
              await change(
                (next) =>
                  recordScheduledPayment(
                    next,
                    selected.id,
                    selection.dueDate,
                    mode === "link" ? { entryId } : { date },
                  ),
                mode === "link"
                  ? "기존 거래를 연결했어요. 잔액은 그대로예요."
                  : "실제 납부 거래를 기록했어요.",
              )
            )
              setSelection(null);
          }}
        >
          <fieldset disabled={busy}>
            <h4>
              {selected.name} · {selection.dueDate} 예정분
            </h4>
            <div className="ledger-fields">
              <label>
                처리 방법
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="link">이미 기록한 거래 연결</option>
                  <option value="record">
                    아직 입력하지 않은 실제 거래 기록
                  </option>
                </select>
              </label>
              {mode === "link" ? (
                <label>
                  금액·계좌가 일치하는 거래
                  <select
                    required
                    value={entryId}
                    onChange={(e) => setEntry(e.target.value)}
                  >
                    <option value="">거래 선택</option>
                    {candidates.map((e) => (
                      <option value={e.id} key={e.id}>
                        {e.date} · {e.description} · {won(-e.amount)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  실제로 납부한 날짜
                  <input
                    type="date"
                    required
                    max={today()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              )}
            </div>
            {mode === "link" && !candidates.length && (
              <p className="ledger-note">
                연결할 거래가 없습니다. 계좌 이동은 양쪽이 연결된 이체만 선택할
                수 있습니다.
              </p>
            )}
            {mode === "record" && (
              <p className="ledger-note">
                확인하면 {won(selected.amount)}의{" "}
                {selected.targetAccountId ? "양쪽 계좌 이동" : "지출"} 거래를
                추가합니다. 실제로 납부한 경우에만 기록하세요.
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">
                {mode === "link" ? "기존 거래 연결" : "실제 거래 기록"}
              </button>
              <button
                className="ledger-btn"
                type="button"
                onClick={() => setSelection(null)}
              >
                취소
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {error && (
        <p className="ledger-error" role="alert">
          {error}
        </p>
      )}
      <p className="ledger-note">
        미연결은 실제 미납을 뜻하지 않습니다. 이미 납부했다면 거래를 연결하세요.
        연결한 거래를 삭제하거나 금액·계좌·종류를 바꾸면 다시 미연결로
        표시됩니다. 전액 납부 기준이며 분할 납부는 지원하지 않습니다.
      </p>
      {!!data.schedules.length && (
        <details>
          <summary>전체 등록 일정 관리 ({data.schedules.length}개)</summary>
          {data.schedules.map((s) => (
            <div className="ledger-funding-goal" key={s.id}>
              <p>
                {s.name} ·{" "}
                {s.startDate === s.endDate ? s.startDate : `매월 ${s.day}일`} ·{" "}
                {won(s.amount)}
              </p>
              <p className="ledger-note">
                {s.startDate} ~ {s.endDate ?? "종료일 없음"}
              </p>
              {s.startDate === s.endDate && !s.payments.length && (
                <button
                  className="ledger-text-btn"
                  disabled={busy}
                  onClick={() => editSchedule(s)}
                >
                  예정 금액·날짜 수정
                </button>
              )}
              <button
                className="ledger-text-btn"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "이 일정과 납부 연결을 삭제할까요? 실제 거래는 유지됩니다. 변경된 일정은 새로 등록할 수 있어요.",
                    )
                  )
                    void change((next) => {
                      next.schedules = next.schedules.filter(
                        (item) => item.id !== s.id,
                      );
                    }, "일정을 삭제했어요. 실제 거래는 유지됩니다.");
                }}
              >
                일정 삭제
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
