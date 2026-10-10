import {
  isLiability,
  MAX_WON,
  validDate,
  type Ledger,
  type PaymentSchedule,
} from "./model.ts";
import { scheduleDate, validateSchedules } from "./schedules.ts";

export interface CardPaymentInput {
  name: string;
  accountId: string;
  cardId: string;
  total: number;
  count: number;
  firstDate: string;
}

export function previewCardPayments(input: CardPaymentInput) {
  if (
    !validDate(input.firstDate) ||
    !Number.isSafeInteger(input.total) ||
    input.total <= 0 ||
    input.total > MAX_WON ||
    !Number.isInteger(input.count) ||
    input.count < 1 ||
    input.count > 36 ||
    input.total < input.count
  )
    throw new Error(
      "첫 결제일·총 납부액·횟수(1~36회)를 확인해 주세요. 회차별 금액은 1원 이상이어야 합니다.",
    );
  const [year, month, day] = input.firstDate.split("-").map(Number);
  const regular = Math.floor(input.total / input.count);
  return Array.from({ length: input.count }, (_, index) => {
    const last = new Date(Date.UTC(year, month - 1 + index + 1, 0));
    const date = new Date(
      Date.UTC(
        last.getUTCFullYear(),
        last.getUTCMonth(),
        Math.min(day, last.getUTCDate()),
      ),
    )
      .toISOString()
      .slice(0, 10);
    if (!validDate(date))
      throw new Error("결제 일정은 2099년까지 등록할 수 있습니다.");
    return {
      date,
      amount:
        index === input.count - 1
          ? input.total - regular * (input.count - 1)
          : regular,
    };
  });
}

export function addCardPayments(data: Ledger, input: CardPaymentInput) {
  const source = data.accounts.find((a) => a.id === input.accountId);
  const card = data.accounts.find((a) => a.id === input.cardId);
  if (!source || isLiability(source) || !card || card.role !== "CREDIT_CARD")
    throw new Error("결제할 은행 계좌와 신용카드를 선택해 주세요.");
  if (!input.name.trim() || input.name.trim().length > 45)
    throw new Error("납부 이름은 1~45자로 입력해 주세요.");
  const rows = previewCardPayments(input);
  if (rows[0]!.date < source.openingDate || rows[0]!.date < card.openingDate)
    throw new Error("첫 결제일은 은행·카드의 잔액 기준일 이후여야 합니다.");
  // A statement total and an installment on the same card/month would overlap.
  if (
    rows.some((row) =>
      data.schedules.some(
        (s) =>
          s.targetAccountId === card.id &&
          scheduleDate(s, row.date.slice(0, 7)) !== null,
      ),
    )
  )
    throw new Error(
      "같은 카드의 해당 월 결제 일정이 이미 있습니다. 청구 총액과 할부를 중복 등록하지 말고, 기존 일정을 확인하거나 합산한 월 청구액으로 등록해 주세요.",
    );
  const schedules: PaymentSchedule[] = rows.map((row, index) => ({
    id: crypto.randomUUID(),
    name: `${input.name.trim()} (${index + 1}/${input.count})`,
    accountId: source.id,
    targetAccountId: card.id,
    amount: row.amount,
    day: Number(row.date.slice(8)),
    startDate: row.date,
    endDate: row.date,
    payments: [],
  }));
  validateSchedules({ ...data, schedules: [...data.schedules, ...schedules] });
  data.schedules.push(...schedules);
}
