import {
  fingerprint,
  money,
  validDate,
  type Entry,
  type EntryKind,
} from "./model.ts";
export interface CsvTable {
  headers: string[];
  rows: string[][];
}
export interface ColumnMap {
  date: number;
  description: number;
  amount: number;
  deposit: number;
  withdrawal: number;
}
export interface ImportRow {
  row: number;
  entry: Omit<Entry, "id" | "batchId" | "pairId"> | null;
  error: string | null;
  duplicate: boolean;
  selected: boolean;
}
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export function parseCsv(input: string): CsvTable {
  if (input.length > MAX_FILE_BYTES)
    throw new Error("5MB 이하의 파일을 선택해 주세요.");
  const source = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (source.includes("\u0000"))
    throw new Error("텍스트 CSV 파일을 선택해 주세요.");
  const firstLine = source.split("\n")[0] ?? "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const finishField = () => {
    row.push(field.trim());
    field = "";
    closed = false;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === delimiter) finishField();
    else if (c === "\n") {
      finishField();
      if (row.some(Boolean)) records.push(row);
      row = [];
      if (records.length > 5001)
        throw new Error("한 번에 5,000건까지 가져올 수 있어요.");
    } else if (c === '"') {
      if (field || closed) throw new Error("CSV 따옴표 형식이 잘못되었습니다.");
      quoted = true;
    } else {
      if (closed && c.trim()) throw new Error("CSV 필드 구분을 확인해 주세요.");
      if (!closed) field += c;
    }
  }
  if (quoted) throw new Error("닫히지 않은 CSV 따옴표가 있습니다.");
  finishField();
  if (row.some(Boolean)) records.push(row);
  if (records.length < 2 || records.length > 5001)
    throw new Error("제목 행과 1~5,000개의 거래 행이 필요합니다.");
  const headers = records.shift()!;
  if (
    headers.length < 3 ||
    headers.length > 100 ||
    headers.some((h) => h.length > 100)
  )
    throw new Error("CSV 열을 확인해 주세요 (3~100개).");
  return { headers, rows: records };
}
export function suggestColumns(headers: string[]): ColumnMap {
  const find = (names: string[]) =>
    headers.findIndex((h) =>
      names.includes(h.replace(/\s/g, "").toLowerCase()),
    );
  return {
    date: find(["날짜", "거래일", "거래일자", "거래일시", "date"]),
    description: find(["내용", "거래내용", "적요", "기재내용", "description"]),
    amount: find(["금액", "거래금액", "amount"]),
    deposit: find(["입금", "입금액", "입금금액", "맡기신금액"]),
    withdrawal: find(["출금", "출금액", "출금금액", "찾으신금액"]),
  };
}
export function prepareRows(
  table: CsvTable,
  columns: ColumnMap,
  accountId: string,
  existing: Entry[],
  openingDate: string,
  asOf: string,
): ImportRow[] {
  const split = columns.amount < 0;
  const required = [
    columns.date,
    columns.description,
    ...(split ? [columns.deposit, columns.withdrawal] : [columns.amount]),
  ];
  if (
    required.some((i) => i < 0 || i >= table.headers.length) ||
    new Set(required).size !== required.length
  )
    throw new Error("날짜·내용과 금액 열을 각각 선택해 주세요.");
  const seen = new Set(existing.map(fingerprint));
  return table.rows.map((cells, index) => {
    try {
      if (cells.length !== table.headers.length)
        throw new Error("제목과 열 개수가 다릅니다.");
      const rawDate = cells[columns.date]!.trim()
        .split(/[ T]/)[0]!
        .replace(/[./]/g, "-");
      const date = rawDate.replace(
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        (_, y: string, m: string, d: string) =>
          `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
      );
      if (!validDate(date) || date > asOf)
        throw new Error(
          "날짜 형식을 확인해 주세요. 미래 거래는 가져올 수 없어요.",
        );
      if (date < openingDate)
        throw new Error("계좌의 잔액 기준일보다 이전 거래입니다.");
      let amount: number;
      if (split) {
        const incoming = money(cells[columns.deposit] || "0");
        const outgoing = money(cells[columns.withdrawal] || "0");
        if (incoming && outgoing)
          throw new Error("입금과 출금이 동시에 있습니다.");
        amount = incoming - outgoing;
      } else amount = money(cells[columns.amount]!, true);
      if (!amount) throw new Error("0원 거래입니다.");
      const description = cells[columns.description]!.trim();
      if (!description || description.length > 160)
        throw new Error("거래내용은 1~160자여야 합니다.");
      const entry = {
        accountId,
        date,
        amount,
        description,
        kind: (amount > 0 ? "INCOME" : "EXPENSE") as EntryKind,
        category: "미분류",
      };
      const key = fingerprint(entry);
      const duplicate = seen.has(key);
      seen.add(key);
      return {
        row: index + 2,
        entry,
        error: null,
        duplicate,
        selected: !duplicate,
      };
    } catch (error) {
      return {
        row: index + 2,
        entry: null,
        error:
          error instanceof Error ? error.message : "행 형식을 확인해 주세요.",
        duplicate: false,
        selected: false,
      };
    }
  });
}
export async function fileHash(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
