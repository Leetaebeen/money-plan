import { cycleBudget } from "./cycle-budget";
import { won, type Ledger } from "./model";

export function CycleBudget({ data }: { data: Ledger }) {
  const result = cycleBudget(data);
  if (!result) return null;
  return (
    <section className="ledger-panel" aria-label="급여 주기 지출 예산">
      <h3>다음 월급 전까지 생활비는?</h3>
      <p className="ledger-note">
        {result.start} ~ {result.end} · {result.asOf}까지 기록한 지출 기준
        <br />
        다음 예정 월급일 {result.next} · 오늘 포함 {result.daysLeft}일 남음
      </p>
      <div className="ledger-stack">
        {result.rows.map((row) => (
          <article className="ledger-funding-goal" key={row.account.id}>
            <h4>
              {row.account.name} · {row.purposes.join(" + ")}
            </h4>
            <dl className="ledger-budget-breakdown">
              <div>
                <dt>주기 예산</dt>
                <dd>{won(row.planned)}</dd>
              </div>
              <div>
                <dt>기록된 지출</dt>
                <dd>{won(row.spent)}</dd>
              </div>
              <div>
                <dt>기록된 환불</dt>
                <dd>{won(row.refunded)}</dd>
              </div>
              <div>
                <dt>
                  {row.remaining !== null && row.remaining < 0
                    ? "예산 초과"
                    : "남은 예산"}
                </dt>
                <dd>
                  {row.remaining === null
                    ? "내역 확인 필요"
                    : won(Math.abs(row.remaining))}
                </dd>
              </div>
              {row.daily !== null && (
                <div>
                  <dt>남은 생활비의 하루 기준액</dt>
                  <dd>{won(row.daily)}</dd>
                </div>
              )}
            </dl>
            {row.partial && (
              <p className="ledger-note">
                계좌 기록이 이번 급여 주기 중간 이후부터 시작해 남은 예산을
                계산하지 않습니다.
              </p>
            )}
            {row.purposes.length > 1 && row.daily === null && !row.partial && (
              <p className="ledger-note">
                같은 계좌의 고정비와 생활비를 합산했습니다. 아직 낼 고정비를
                구분할 수 없어 하루 기준액은 표시하지 않습니다.
              </p>
            )}
            {row.daily !== null && (
              <p className="ledger-note">
                오늘 남은 시간부터 다음 월급 전날까지 균등하게 나눈 금액입니다.
                앞으로 예정된 생활비 지출은 이 안에서 남겨 두세요.
              </p>
            )}
          </article>
        ))}
      </div>
      {!result.rows.length && (
        <p>월급 계획에 고정비 또는 생활비 계좌를 선택해 주세요.</p>
      )}
      <p className="ledger-note">
        남은 예산은 계좌 잔액이나 실제 사용 가능 현금이 아닙니다. 현재 계획과
        선택한 지출 계좌의 기록만 비교하며, 수입·이체·잔액 조정은 소비에
        포함하지 않습니다. 누락한 지출과 다른 계좌의 결제는 반영되지 않으며
        환불은 받은 날짜에 차감합니다. 급여 입금 여부와 휴일에 따른 월급일
        변경은 자동 확인하지 않습니다.
      </p>
    </section>
  );
}
