import { useState } from "react";
import { money, type PaymentSchedule } from "./model";
import { nextScheduleMonth, reviseRecurringSchedule } from "./schedules";
import type { PanelProps } from "./shared";

export function RecurringScheduleEditor({
  schedule,
  busy,
  change,
}: Pick<PanelProps, "busy" | "change"> & { schedule: PaymentSchedule }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(nextScheduleMonth());
  const [amount, setAmount] = useState(String(schedule.amount));
  const [day, setDay] = useState(schedule.day);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="ledger-text-btn"
        disabled={busy}
        onClick={() => {
          setOpen(!open);
          setAmount(String(schedule.amount));
          setDay(schedule.day);
          setError("");
        }}
      >
        다음 달 이후 금액·납부일 변경
      </button>
      {open && (
        <form
          className="ledger-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              const value = money(amount);
              if (
                await change(
                  (next) =>
                    reviseRecurringSchedule(
                      next,
                      schedule.id,
                      month,
                      value,
                      day,
                    ),
                  "새 납부 일정을 적용했어요. 이전 일정과 실제 거래는 보존했어요.",
                )
              )
                setOpen(false);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "입력을 확인해 주세요.",
              );
            }
          }}
        >
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                변경 적용 월
                <input
                  required
                  type="month"
                  min={nextScheduleMonth()}
                  max={schedule.endDate?.slice(0, 7) ?? "2099-12"}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </label>
              <label>
                새 월 납부액 (원)
                <input
                  required
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>
              <label>
                새 매월 납부일
                <select
                  value={day}
                  onChange={(e) => setDay(Number(e.target.value))}
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="ledger-note">
              {month}부터 매월 {day}일(없는 날짜는 말일)에 새 금액을 적용합니다.
              기존 일정은 적용 월 전날까지 보존하고 새 일정을 하나 추가합니다.
              계좌·기존 종료일·실제 거래·월급 배분 계획은 바꾸지 않습니다. 변경
              기간에 납부 연결이 있으면 먼저 해제해야 합니다.
            </p>
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">변경 저장</button>
              <button
                type="button"
                className="ledger-btn"
                onClick={() => setOpen(false)}
              >
                취소
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </>
  );
}
