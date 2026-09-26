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
  sourceRows?: number[];
}
export interface CsvDocument {
  records: string[][];
  sourceRows: number[];
}
export interface ColumnMap {
  date: number;
  description: number;
  amount: number;
  deposit: number;
  withdrawal: number;
  direction?: number;
}
export interface ImportRow {
  row: number;
  entry: Omit<Entry, "id" | "batchId" | "pairId"> | null;
  error: string | null;
  duplicate: boolean;
  selected: boolean;
}
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export type CsvDelimiter = "auto" | "," | "\t";
export function parseCsv(input: string): CsvTable {
  return selectHeader(parseCsvDocument(input), 0);
}
export function parseCsvDocument(
  input: string,
  separator: CsvDelimiter = "auto",
): CsvDocument {
  if (input.length > MAX_FILE_BYTES)
    throw new Error("5MB 이하의 파일을 선택해 주세요.");
  const source = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (source.includes("\u0000"))
    throw new Error("텍스트 CSV 파일을 선택해 주세요.");
  const delimiter = separator === "auto" ? detectDelimiter(source) : separator;
  const records: string[][] = [];
  const sourceRows: number[] = [];
  let line = 1;
  let rowStart = 1;
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const finishField = () => {
    row.push(field.trim());
    if (row.length > 100)
      throw new Error("파일은 최대 100개 열까지 지원합니다.");
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
      } else {
        field += c;
        if (c === "\n") line++;
      }
    } else if (c === delimiter) finishField();
    else if (c === "\n") {
      finishField();
      records.push(row);
      sourceRows.push(rowStart);
      line++;
      rowStart = line;
      row = [];
      if (records.length > 5050)
        throw new Error("안내·빈 행을 포함해 최대 5,050행까지 지원합니다.");
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
  if (row.some(Boolean)) {
    records.push(row);
    sourceRows.push(rowStart);
  }
  if (records.length < 2 || records.length > 5050)
    throw new Error(
      "제목과 거래 행이 필요하며 안내·빈 행 포함 최대 5,050행입니다.",
    );
  return { records, sourceRows };
}
export function selectHeader(document: CsvDocument, index: number): CsvTable {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= Math.min(50, document.records.length)
  )
    throw new Error("처음 50개 행 안에서 열 제목을 선택해 주세요.");
  const headers = document.records[index]!;
  if (
    headers.length < 3 ||
    headers.length > 100 ||
    headers.some((h) => h.length > 100)
  )
    throw new Error("CSV 열을 확인해 주세요 (3~100개).");
  const rows: string[][] = [];
  const sourceRows: number[] = [];
  document.records.slice(index + 1).forEach((row, offset) => {
    if (row.some(Boolean)) {
      rows.push(row);
      sourceRows.push(document.sourceRows[index + 1 + offset]!);
    }
  });
  if (!rows.length || rows.length > 5000)
    throw new Error("제목 아래에 1~5,000개의 거래 행이 필요합니다.");
  return { headers, rows, sourceRows };
}
function detectDelimiter(source: string): "," | "\t" {
  let quoted = false;
  let commas = 0,
    tabs = 0,
    maxCommas = 0,
    maxTabs = 0,
    records = 0;
  for (let i = 0; i < source.length && records < 50; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (c === ",") maxCommas = Math.max(maxCommas, ++commas);
      else if (c === "\t") maxTabs = Math.max(maxTabs, ++tabs);
      else if (c === "\n") {
        records++;
        commas = 0;
        tabs = 0;
      }
    }
  }
  return maxTabs > maxCommas ? "\t" : ",";
}
export function suggestHeader(document: CsvDocument): number {
  const candidate = document.records.slice(0, 50).findIndex((row) => {
    const c = suggestColumns(row);
    return (
      c.date >= 0 &&
      c.description >= 0 &&
      (c.amount >= 0 || (c.deposit >= 0 && c.withdrawal >= 0))
    );
  });
  return candidate >= 0
    ? candidate
    : Math.max(
        0,
        document.records.slice(0, 50).findIndex((row) => row.length >= 3),
      );
}
export function statementDate(value: string): string {
  const normalized = value
    .trim()
    .replace(/^(\d{4})(\d{2})(\d{2})(?=$|[ T])/, "$1-$2-$3")
    .replace(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/, "$1-$2-$3");
  const match =
    /^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})(?:[ T](?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?)?$/.exec(
      normalized,
    );
  if (!match)
    throw new Error("날짜 형식을 확인해 주세요 (예: 20260901, 2026-09-01).");
  const date = `${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}`;
  if (!validDate(date)) throw new Error("존재하지 않는 날짜입니다.");
  return date;
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
    direction: find(["입출금", "입출금구분", "거래구분", "구분", "direction"]),
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
  const directed = !split && (columns.direction ?? -1) >= 0;
  const required = [
    columns.date,
    columns.description,
    ...(split ? [columns.deposit, columns.withdrawal] : [columns.amount]),
    ...(directed ? [columns.direction!] : []),
  ];
  if (
    required.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= table.headers.length,
    ) ||
    new Set(required).size !== required.length
  )
    throw new Error("날짜·내용과 금액 열을 각각 선택해 주세요.");
  const seen = new Set(existing.map(fingerprint));
  return table.rows.map((cells, index) => {
    try {
      if (cells.length !== table.headers.length)
        throw new Error("제목과 열 개수가 다릅니다.");
      const date = statementDate(cells[columns.date]!);
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
      } else if (directed) {
        const direction = cells[columns.direction!]!.trim().toLowerCase();
        const incoming = ["입금", "수입", "deposit", "credit", "in"].includes(
          direction,
        );
        const outgoing = [
          "출금",
          "지출",
          "withdrawal",
          "debit",
          "out",
        ].includes(direction);
        if (!incoming && !outgoing)
          throw new Error(
            "입출금 구분을 읽지 못했습니다. 입금/출금 값을 확인해 주세요.",
          );
        amount = money(cells[columns.amount]!);
        if (outgoing) amount = -amount;
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
        row: table.sourceRows?.[index] ?? index + 2,
        entry,
        error: null,
        duplicate,
        selected: !duplicate,
      };
    } catch (error) {
      return {
        row: table.sourceRows?.[index] ?? index + 2,
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
