import { useState } from "react";
import { isLiability, money, today, won } from "./model";
import {
  addCardPayments,
  previewCardPayments,
  type CardPaymentInput,
} from "./card-payments";
import type { PanelProps } from "./shared";

export function CardPayments({ data, busy, change }: PanelProps) {
  const cards = data.accounts.filter((a) => a.role === "CREDIT_CARD");
  const banks = data.accounts.filter((a) => !isLiability(a));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccount] = useState("");
  const [cardId, setCard] = useState("");
  const [value, setValue] = useState("");
  const [count, setCount] = useState("1");
  const [firstDate, setDate] = useState(today());
  const [error, setError] = useState("");
  if (!cards.length) return null;
  let preview: ReturnType<typeof previewCardPayments> = [];
  try {
    preview = previewCardPayments({
      name,
      accountId,
      cardId,
      total: money(value),
      count: Number(count),
      firstDate,
    });
  } catch {
    /* Show validation errors on submission. */
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const input: CardPaymentInput = {
        name,
        accountId,
        cardId,
        total: money(value),
        count: Number(count),
        firstDate,
      };
      if (
        await change(
          (next) => addCardPayments(next, input),
          "카드 결제 일정을 등록했어요. 실제 거래와 잔액은 그대로예요.",
        )
      ) {
        setOpen(false);
        setValue("");
        setName("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    }
  }
  return (
    <section className="ledger-panel" aria-label="카드 결제 계획">
      <div className="ledger-section-title">
        <h3>카드 결제 예정액·할부</h3>
        <button
          className="ledger-btn"
          disabled={busy}
          onClick={() => {
            setOpen(!open);
            setError("");
          }}
        >
          일정 {open ? "닫기" : "등록"}
        </button>
      </div>
      <p className="ledger-note">
        카드사가 안내한 청구액은 1회로, 앞으로 낼 할부 총액은 남은 횟수로 나눠
        등록하세요. 이미 낸 금액은 제외합니다. 일정 등록은 소비·부채를 새로
        만들지 않습니다.
      </p>
      {open && (
        <form className="ledger-form" onSubmit={save}>
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                납부 이름
                <input
                  required
                  maxLength={45}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 10월 카드 청구액"
                />
              </label>
              <label>
                결제 계좌
                <select
                  required
                  value={accountId}
                  onChange={(e) => setAccount(e.target.value)}
                >
                  <option value="">선택</option>
                  {banks.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                신용카드
                <select
                  required
                  value={cardId}
                  onChange={(e) => setCard(e.target.value)}
                >
                  <option value="">선택</option>
                  {cards.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                앞으로 낼 총액 (원)
                <input
                  required
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <label>
                남은 납부 횟수
                <input
                  required
                  type="number"
                  min={1}
                  max={36}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </label>
              <label>
                첫 결제 예정일
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                  value={firstDate}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
            <p className="ledger-note">
              첫 결제일의 일자를 매월 사용하며 없는 날짜는 월말로 잡아요. 원
              단위 나머지는 마지막 회차에 더합니다. 이자·수수료와 휴일은 자동
              계산하지 않으므로 실제 청구액·날짜를 확인하세요.
            </p>
            {!!preview.length && (
              <div className="ledger-stack" aria-label="결제 일정 미리보기">
                {preview.map((row, index) => (
                  <div className="ledger-row" key={row.date}>
                    <span>
                      {index + 1}회 · {row.date}
                    </span>
                    <strong>{won(row.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
            {error && (
              <p className="ledger-error" role="alert">
                {error}
              </p>
            )}
            <button className="ledger-btn ledger-primary">일정 저장</button>
          </fieldset>
        </form>
      )}
      <p className="ledger-note">
        저장한 일정은 아래 납부 일정에서 월별로 조회하고 거래를 연결하세요. 같은
        카드·같은 월은 한 결제 일정으로 관리합니다. 여러 할부와 일시불이 함께
        청구되면 합산된 월 청구액을 등록하세요. 할부 구매 지출은 구매 시 전체
        금액을 한 번 기록하고, 납부는 계좌 이동으로 기록합니다.
      </p>
    </section>
  );
}
