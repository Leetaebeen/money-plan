import { useState } from "react";
import { isLiability, money, today, won, type Account } from "./model";
import {
  reconcileAccountBalance,
  reconciliationPreview,
} from "./account-reconciliation";
import type { PanelProps } from "./shared";

export function AccountReconciliation({
  account,
  data,
  busy,
  change,
}: PanelProps & { account: Account }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  let preview: ReturnType<typeof reconciliationPreview> | null = null;
  let previewError = "";
  if (open && actual.trim()) {
    try {
      preview = reconciliationPreview(
        data,
        account.id,
        date,
        money(actual, true),
      );
    } catch (e) {
      previewError = e instanceof Error ? e.message : "잔액을 확인해 주세요.";
    }
  }
  return (
    <>
      <button
        className="ledger-text-btn"
        disabled={busy || account.openingBalance === null}
        onClick={() => {
          setOpen(!open);
          setError("");
        }}
      >
        실제 잔액과 맞추기
      </button>
      {open && (
        <form
          className="ledger-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              const value = money(actual, true);
              if (
                await change(
                  (next) =>
                    reconcileAccountBalance(
                      next,
                      account.id,
                      date,
                      value,
                      note,
                    ),
                  "차액을 잔액 조정 거래로 기록했어요.",
                )
              ) {
                setOpen(false);
                setActual("");
                setNote("");
              }
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "입력을 확인해 주세요.",
              );
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              잔액 확인일
              <input
                required
                type="date"
                min={account.openingDate}
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              금융기관에서 확인한 잔액 (원)
              <input
                required
                inputMode="text"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </label>
            {isLiability(account) && (
              <p className="ledger-note">
                남은 부채는 음수로 입력하세요. 예: 갚을 돈 100,000원 → -100000.
                초과 납부·환급 잔액은 양수입니다.
              </p>
            )}
            <label>
              조정 사유
              <input
                required
                maxLength={160}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 증권 계좌 평가액 반영"
              />
            </label>
            {preview && (
              <p className="ledger-note">
                기록 잔액 {won(preview.recorded)} → 확인 잔액{" "}
                {won(preview.actual)} · 조정 차액{" "}
                {preview.adjustment > 0 ? "+" : ""}
                {won(preview.adjustment)}
              </p>
            )}
            <p className="ledger-note">
              해당일까지 기록한 모든 거래를 반영한 잔액과 비교합니다. 누락된
              지출·수입·이체는 먼저 거래로 기록하세요. 차액은 수입·소비·저축
              납입에 포함하지 않는 잔액 조정으로 남으며, 이후 잔액과 목표
              진행에는 반영됩니다.
            </p>
            {(error || previewError) && (
              <p className="ledger-error" role="alert">
                {error || previewError}
              </p>
            )}
            <div className="ledger-actions">
              <button
                className="ledger-btn ledger-primary"
                disabled={!preview?.adjustment || !note.trim()}
              >
                차액 기록
              </button>
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
