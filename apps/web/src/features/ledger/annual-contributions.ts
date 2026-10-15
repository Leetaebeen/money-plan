import { today, validDate, type Ledger } from "./model.ts";

export function annualContributions(
  data: Ledger,
  year: number,
  asOf = today(),
) {
  if (
    !validDate(asOf) ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > Number(asOf.slice(0, 4))
  )
    throw new Error("2000년부터 올해 사이의 조회 연도를 선택해 주세요.");
  const start = `${year}-01-01`;
  const end = year === Number(asOf.slice(0, 4)) ? asOf : `${year}-12-31`;
  return data.accounts
    .filter((a) => a.role === "ISA" || a.role === "PENSION")
    .map((account) => {
      const entries = data.entries.filter(
        (e) =>
          e.accountId === account.id &&
          e.kind === "TRANSFER" &&
          e.date >= start &&
          e.date <= end,
      );
      const summarize = (selected: typeof entries) => {
        const deposited = selected
          .filter((e) => e.amount > 0)
          .reduce((sum, e) => sum + e.amount, 0);
        const withdrawn = selected
          .filter((e) => e.amount < 0)
          .reduce((sum, e) => sum - e.amount, 0);
        return {
          deposited,
          withdrawn,
          net: deposited - withdrawn,
          count: selected.length,
          unpaired: selected.filter((e) => !e.pairId).length,
        };
      };
      const months = Array.from(
        { length: Number(end.slice(5, 7)) },
        (_, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          return {
            month,
            ...summarize(entries.filter((e) => e.date.startsWith(month))),
          };
        },
      );
      return {
        account,
        start,
        end,
        partial: account.openingDate > start,
        ...summarize(entries),
        months,
      };
    });
}
