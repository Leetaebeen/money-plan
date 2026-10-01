import {
  MAX_WON,
  today,
  validDate,
  type Entry,
  type Ledger,
  type PaymentSchedule,
} from "./model.ts";

export function scheduleDate(
  schedule: PaymentSchedule,
  month: string,
): string | null {
  if (!validDate(`${month}-01`)) throw new Error("조회 월을 확인해 주세요.");
  const [year, mm] = month.split("-").map(Number);
  const day = Math.min(
    schedule.day,
    new Date(Date.UTC(year, mm, 0)).getUTCDate(),
  );
  const date = `${month}-${String(day).padStart(2, "0")}`;
  return date < schedule.startDate ||
    (schedule.endDate !== null && date > schedule.endDate)
    ? null
    : date;
}

export function matchesSchedule(
  schedule: PaymentSchedule,
  entry: Entry | undefined,
  entries: Entry[],
) {
  if (
    !entry ||
    entry.accountId !== schedule.accountId ||
    entry.amount !== -schedule.amount
  )
    return false;
  if (schedule.targetAccountId === null) return entry.kind === "EXPENSE";
  return (
    entry.kind === "TRANSFER" &&
    !!entry.pairId &&
    entries.some(
      (other) =>
        other.id !== entry.id &&
        other.pairId === entry.pairId &&
        other.accountId === schedule.targetAccountId &&
        other.amount === schedule.amount &&
        other.date === entry.date,
    )
  );
}

export function validateSchedules(data: Ledger) {
  const fail = () => {
    throw new Error("납부 일정의 금액·날짜·계좌·거래 연결을 확인해 주세요.");
  };
  if (!Array.isArray(data.schedules) || data.schedules.length > 100) fail();
  const ids = new Set<string>();
  const used = new Set<string>();
  for (const s of data.schedules) {
    if (
      !s ||
      typeof s !== "object" ||
      typeof s.id !== "string" ||
      !s.id.trim() ||
      s.id.length > 160 ||
      ids.has(s.id) ||
      typeof s.name !== "string" ||
      !s.name.trim() ||
      s.name.length > 60 ||
      !data.accounts.some((a) => a.id === s.accountId) ||
      !(
        s.targetAccountId === null ||
        (s.targetAccountId !== s.accountId &&
          data.accounts.some((a) => a.id === s.targetAccountId))
      ) ||
      !Number.isSafeInteger(s.amount) ||
      s.amount <= 0 ||
      s.amount > MAX_WON ||
      !Number.isInteger(s.day) ||
      s.day < 1 ||
      s.day > 31 ||
      !validDate(s.startDate) ||
      !(
        s.endDate === null ||
        (validDate(s.endDate) && s.endDate >= s.startDate)
      ) ||
      !Array.isArray(s.payments) ||
      s.payments.length > 1200
    )
      fail();
    ids.add(s.id);
    const dates = new Set<string>();
    for (const p of s.payments) {
      if (
        !p ||
        typeof p !== "object" ||
        !validDate(p.dueDate) ||
        scheduleDate(s, p.dueDate.slice(0, 7)) !== p.dueDate ||
        dates.has(p.dueDate) ||
        used.has(p.entryId) ||
        !matchesSchedule(
          s,
          data.entries.find((e) => e.id === p.entryId),
          data.entries,
        )
      )
        fail();
      dates.add(p.dueDate);
      used.add(p.entryId);
      if (used.size > 5000) fail();
    }
  }
}

export function reconcileSchedulePayments(data: Ledger) {
  for (const s of data.schedules)
    s.payments = s.payments.filter((p) =>
      matchesSchedule(
        s,
        data.entries.find((e) => e.id === p.entryId),
        data.entries,
      ),
    );
}

export function paymentCandidates(
  data: Ledger,
  schedule: PaymentSchedule,
  asOf = today(),
) {
  const used = new Set(
    data.schedules.flatMap((s) => s.payments.map((p) => p.entryId)),
  );
  return data.entries
    .filter(
      (e) =>
        e.date <= asOf &&
        !used.has(e.id) &&
        matchesSchedule(schedule, e, data.entries),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function recordScheduledPayment(
  data: Ledger,
  scheduleId: string,
  dueDate: string,
  input: { entryId: string } | { date: string },
  asOf = today(),
) {
  const s = data.schedules.find((item) => item.id === scheduleId);
  if (
    !validDate(asOf) ||
    !s ||
    !validDate(dueDate) ||
    scheduleDate(s, dueDate.slice(0, 7)) !== dueDate
  )
    throw new Error("등록된 납부 일정을 확인해 주세요.");
  if (s.payments.some((p) => p.dueDate === dueDate))
    throw new Error("이미 납부 거래가 연결되어 있습니다.");
  let entryId: string;
  if ("entryId" in input) {
    if (!paymentCandidates(data, s, asOf).some((e) => e.id === input.entryId))
      throw new Error("금액과 계좌가 일치하는 미연결 거래를 선택해 주세요.");
    entryId = input.entryId;
  } else {
    if (
      !validDate(input.date) ||
      input.date > asOf ||
      [s.accountId, s.targetAccountId].filter(Boolean).some((id) => {
        const account = data.accounts.find((a) => a.id === id);
        return !account || input.date < account.openingDate;
      })
    )
      throw new Error(
        "계좌 기준일 이후, 오늘까지의 실제 납부일을 입력해 주세요.",
      );
    // Existing matching transactions must be explicitly linked or reviewed first.
    if (paymentCandidates(data, s, asOf).some((e) => e.date === input.date))
      throw new Error(
        "같은 날짜·계좌·금액의 거래가 있습니다. 기존 거래 연결을 먼저 확인해 주세요.",
      );
    entryId = crypto.randomUUID();
    const entry: Entry = {
      id: entryId,
      accountId: s.accountId,
      amount: -s.amount,
      date: input.date,
      description: s.name,
      category: s.targetAccountId ? "저축·이체" : "고정비",
      kind: s.targetAccountId ? "TRANSFER" : "EXPENSE",
      pairId: s.targetAccountId ? crypto.randomUUID() : null,
      batchId: null,
    };
    data.entries.push(entry);
    if (s.targetAccountId)
      data.entries.push({
        ...entry,
        id: crypto.randomUUID(),
        accountId: s.targetAccountId,
        amount: s.amount,
      });
  }
  s.payments.push({ dueDate, entryId });
}

export function scheduleMonth(data: Ledger, month: string, asOf = today()) {
  if (!validDate(`${month}-01`) || !validDate(asOf))
    throw new Error("조회 월을 확인해 주세요.");
  return data.schedules
    .flatMap((schedule) => {
      const dueDate = scheduleDate(schedule, month);
      if (!dueDate) return [];
      const payment = schedule.payments.find((p) => p.dueDate === dueDate);
      return [
        {
          schedule,
          dueDate,
          payment,
          status: payment
            ? "paid"
            : dueDate < asOf
              ? "overdue"
              : dueDate === asOf
                ? "today"
                : "upcoming",
        },
      ];
    })
    .sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.schedule.name.localeCompare(b.schedule.name, "ko"),
    );
}
