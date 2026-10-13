import type { Ledger } from "./model.ts";

export function changeCardBudgets(
  data: Ledger,
  ids: string[],
  budget: "FIXED" | "LIVING" | "",
) {
  if (budget !== "FIXED" && budget !== "LIVING" && budget !== "")
    throw new Error("카드 예산 구분을 확인해 주세요.");
  const selected = new Set(ids);
  if (!selected.size || selected.size > 30 || selected.size !== ids.length)
    throw new Error("현재 페이지에서 1~30개의 카드 거래를 선택해 주세요.");
  const cards = new Set(
    data.accounts.filter((a) => a.role === "CREDIT_CARD").map((a) => a.id),
  );
  const entries = data.entries.filter((entry) => selected.has(entry.id));
  if (
    entries.length !== selected.size ||
    entries.some(
      (entry) =>
        !cards.has(entry.accountId) ||
        (entry.kind !== "EXPENSE" && entry.kind !== "REFUND"),
    )
  )
    throw new Error(
      "카드 지출·환불만 선택해 주세요. 다른 거래가 섞이면 변경하지 않습니다.",
    );
  for (const entry of entries) {
    if (budget) entry.cardBudget = budget;
    else delete entry.cardBudget;
  }
}

export function changeTransactionCategories(
  data: Ledger,
  ids: string[],
  category: string,
) {
  const name = category.trim();
  const selected = new Set(ids);
  if (!name || name.length > 60)
    throw new Error("카테고리는 1~60자로 입력해 주세요.");
  if (!selected.size || selected.size > 30 || selected.size !== ids.length)
    throw new Error("현재 페이지에서 1~30개의 거래를 선택해 주세요.");
  const entries = data.entries.filter((entry) => selected.has(entry.id));
  if (
    entries.length !== selected.size ||
    entries.some((entry) => entry.kind !== "EXPENSE" && entry.kind !== "REFUND")
  )
    throw new Error(
      "선택한 거래가 바뀌었습니다. 지출·환불 거래를 다시 선택해 주세요.",
    );
  for (const entry of entries) entry.category = name;
}
