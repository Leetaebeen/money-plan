import { useState } from "react";
import {
  balance,
  isLiability,
  money,
  planUsesAccount,
  roles,
  today,
  validDate,
  won,
  type Account,
  type AccountRole,
} from "./model";
import { Empty, type PanelProps } from "./shared";
import { MaturityPlans } from "./MaturityPlans";
export function Accounts({ data, busy, change }: PanelProps) {
  const [editing, setEditing] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AccountRole>("LIVING");
  const [opening, setOpening] = useState("");
  const [date, setDate] = useState(today());
  const edit = (account: Account) => {
    setEditing(account);
    setName(account.name);
    setRole(account.role);
    setOpening(
      account.openingBalance === null ? "" : String(account.openingBalance),
    );
    setDate(account.openingDate);
    setError("");
  };
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (!editing || !validDate(date) || date > today())
        throw new Error("오늘 이전의 잔액 기준일을 선택해 주세요.");
      if (data.entries.some((e) => e.accountId === editing.id && e.date < date))
        throw new Error("기록된 거래보다 뒤로 기준일을 옮길 수 없습니다.");
      const account: Account = {
        ...editing,
        name: name.trim(),
        role,
        openingBalance: opening.trim() === "" ? null : money(opening, true),
        openingDate: date,
      };
      if (
        await change((next) => {
          const index = next.accounts.findIndex((a) => a.id === account.id);
          if (index < 0) next.accounts.push(account);
          else next.accounts[index] = account;
        }, "계좌를 저장했어요.")
      )
        setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력을 확인해 주세요.");
    }
  }
  return (
    <section>
      <div className="ledger-section-title">
        <div>
          <h2>내 계좌·카드·대출</h2>
          <p>기준일 00시 잔액에 이후 거래를 더해 계산해요.</p>
        </div>
        <button
          className="ledger-btn"
          disabled={busy}
          onClick={() =>
            edit({
              id: crypto.randomUUID(),
              name: "",
              role: "LIVING",
              openingBalance: null,
              openingDate: today(),
            })
          }
        >
          + 계좌 추가
        </button>
      </div>
      {editing && (
        <form className="ledger-panel ledger-form" onSubmit={save}>
          <h3>
            {data.accounts.some((a) => a.id === editing.id)
              ? "계좌 설정"
              : "새 계좌"}
          </h3>
          <fieldset disabled={busy}>
            <div className="ledger-fields">
              <label>
                계좌 이름
                <input
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="예: 국민 생활비"
                />
              </label>
              <label>
                계좌 역할
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AccountRole)}
                >
                  {Object.entries(roles).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                잔액 기준일
                <input
                  type="date"
                  required
                  max={today()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                기준일 00시 잔액 (원, 카드 미결제액·대출 잔액은 음수)
                <input
                  inputMode="numeric"
                  value={opening}
                  onChange={(e) => setOpening(e.target.value)}
                  placeholder="모르면 비워두세요"
                />
              </label>
            </div>
            <p className="ledger-note">
              예: 9월 내역을 가져오려면 9월 1일 00시 잔액을 입력해요. 현재
              잔액에 지난 거래를 더하면 중복 계산됩니다. 카드 미결제액이 30만
              원이면 -300000을 입력해요. 대출도 남은 원금을 음수로 입력해요.
              투자계좌는 평가액 조정 거래로 변동을 반영할 수 있어요.
            </p>
            {error && (
              <p role="alert" className="ledger-error">
                {error}
              </p>
            )}
            <div className="ledger-actions">
              <button className="ledger-btn ledger-primary">계좌 저장</button>
              <button
                className="ledger-btn"
                type="button"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
            </div>
          </fieldset>
        </form>
      )}
      {!data.accounts.length && (
        <Empty>계좌를 추가하고 잔액을 등록해 주세요.</Empty>
      )}
      <MaturityPlans data={data} busy={busy} change={change} />
      <div className="ledger-account-grid">
        {data.accounts.map((account) => {
          const current = balance(account, data.entries);
          const imported = data.batches
            .filter((b) => b.accountId === account.id)
            .sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0];
          const latest = data.entries
            .filter((e) => e.accountId === account.id)
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          return (
            <article className="ledger-panel" key={account.id}>
              <div className="ledger-row">
                <span className="ledger-tag">{roles[account.role]}</span>
                <button
                  className="ledger-text-btn"
                  onClick={() => edit(account)}
                  disabled={busy}
                  aria-label={`${account.name} 설정`}
                >
                  설정
                </button>
              </div>
              <h3>{account.name}</h3>
              <strong className="ledger-amount">
                {current === null
                  ? "잔액 등록 필요"
                  : isLiability(account)
                    ? current <= 0
                      ? `남은 부채 ${won(-current)}`
                      : `초과 납부·환급 잔액 ${won(current)}`
                    : won(current)}
              </strong>
              <p className="ledger-note">
                기준 {account.openingDate} · 최근 거래 {latest?.date ?? "없음"}
              </p>
              <p className="ledger-note">
                파일 반영 {imported ? imported.importedAt.slice(0, 10) : "없음"}
              </p>
              {planUsesAccount(data.monthlyPlan, account.id) && (
                <p className="ledger-note">월급 배분 계획에 사용 중</p>
              )}
              {!planUsesAccount(data.monthlyPlan, account.id) &&
                !data.maturities.some(
                  (m) =>
                    m.accountId === account.id ||
                    m.allocations.some((a) => a.accountId === account.id),
                ) &&
                !data.schedules.some(
                  (s) =>
                    s.accountId === account.id ||
                    s.targetAccountId === account.id,
                ) &&
                !data.entries.some((e) => e.accountId === account.id) &&
                !data.goals.some((g) => g.accountIds.includes(account.id)) &&
                !data.batches.some((b) => b.accountId === account.id) && (
                  <button
                    className="ledger-text-btn"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`${account.name} 계좌를 삭제할까요?`))
                        void change((next) => {
                          next.accounts = next.accounts.filter(
                            (a) => a.id !== account.id,
                          );
                        }, "계좌를 삭제했어요.");
                    }}
                  >
                    계좌 삭제
                  </button>
                )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
