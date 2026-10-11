import { netWorth, today, validDate, type Ledger } from "./model.ts";

export function wealthHistory(data: Ledger, asOf = today()) {
  if (!validDate(asOf)) throw new Error("자산 조회 기준일을 확인해 주세요.");
  const [year, month] = asOf.split("-").map(Number);
  let previous: number | null = null;
  return Array.from({ length: 6 }, (_, index) => {
    const monthEnd = new Date(Date.UTC(year, month - 5 + index, 0))
      .toISOString()
      .slice(0, 10);
    const date = index === 5 ? asOf : monthEnd;
    if (!validDate(date)) return null;
    const summary = netWorth(data, date);
    const net = summary.complete && summary.known > 0 ? summary.net : null;
    const change = previous !== null && net !== null ? net - previous : null;
    previous = net;
    return {
      month: date.slice(0, 7),
      date,
      assets: summary.assets,
      debt: summary.debt,
      unknown: summary.unknown,
      net,
      change,
      current: index === 5,
    };
  }).filter((row) => row !== null);
}
