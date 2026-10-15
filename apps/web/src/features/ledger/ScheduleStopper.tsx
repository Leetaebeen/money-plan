import { useState } from "react";
import { today, type PaymentSchedule } from "./model";
import { stopRecurringSchedule, scheduleDate } from "./schedules";
import type { PanelProps } from "./shared";

export function ScheduleStopper({
  schedule,
  busy,
  change,
}: Pick<PanelProps, "busy" | "change"> & { schedule: PaymentSchedule }) {
  const [open, setOpen] = useState(false);
  const minimum = schedule.startDate > today() ? schedule.startDate : today();
  const [date, setDate] = useState(minimum);
  const [error, setError] = useState("");
  let due: string | null = null;
  try {
    due = scheduleDate(schedule, date.slice(0, 7));
  } catch {
    /* incomplete date input */
  }
  return (
    <>
      <button
        className="ledger-text-btn"
        disabled={busy}
        onClick={() => {
          setOpen(!open);
          setError("");
        }}
      >
        반복 일정 종료
      </button>
      {open && (
        <form
          className="ledger-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              if (
                await change(
                  (next) => stopRecurringSchedule(next, schedule.id, date),
                  "반복 일정을 종료했어요. 이전 납부 기록과 실제 거래는 유지돼요.",
                )
              )
                setOpen(false);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "종료일을 확인해 주세요.",
              );
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              마지막으로 포함할 날짜
              <input
                required
                type="date"
                min={minimum}
                max={schedule.endDate ?? "2099-12-31"}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <p className="ledger-note">
              {date}까지의 예정일은 유지하고 이후 반복은 표시하지 않습니다.{" "}
              {due
                ? `종료 월의 ${due} 예정분은 ${due <= date ? "포함됩니다" : "제외됩니다"}.`
                : "종료 월에 기존 예정분이 없습니다."}{" "}
              과거 납부 연결·실제 거래·월급 배분 계획은 유지됩니다.
            </p>
            <p className="ledger-note">
              금융기관의 자동이체나 구독을 해지하는 기능은 아닙니다. 실제 해지는
              해당 금융기관·서비스에서 진행하세요.
            </p>
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">종료일 저장</button>
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
