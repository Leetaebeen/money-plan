import type { Ledger } from "./model.ts";

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
