import { useState } from "react";
import { savingsActuals } from "./savings-actuals";
import { today, won, type Ledger } from "./model";

export function SavingsActuals({ data }: { data: Ledger }) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const [error, setError] = useState("");
  const result = savingsActuals(data, month);
  return (
    <section className="ledger-panel" aria-label="월 저축 실적">
      <div className="ledger-section-title">
        <div>
          <h3>계획대로 모으고 있나요?</h3>
          <p>실제로 기록한 계좌 이동으로 확인해요.</p>
        </div>
      </div>
      <label className="ledger-actual-month">
        실적 조회 월
        <input
          type="month"
          min="2000-01"
          max={today().slice(0, 7)}
          value={month}
          onChange={(e) => {
            try {
              savingsActuals(data, e.target.value);
              setMonth(e.target.value);
              setError("");
            } catch {
              setError("오늘까지의 조회 월을 선택해 주세요.");
            }
          }}
        />
      </label>
      {error && (
        <p className="ledger-error" role="alert">
          {error}
        </p>
      )}
      <p className="ledger-note">
        {result.start} ~ {result.end} · 현재 저장된 월 배분 계획과 비교합니다.
        지난달의 계획 이력을 보관하는 기능은 아직 없어요.
      </p>
      <dl className="ledger-budget-breakdown">
        <div>
          <dt>월 저축·투자 계획 합계</dt>
          <dd>{won(result.total.planned)}</dd>
        </div>
        <div>
          <dt>
            기록된 순이체{" "}
            {result.total.unpaired || result.total.partial ? "(잠정)" : "실적"}
          </dt>
          <dd>{won(result.total.net)}</dd>
        </div>
        <div>
          <dt>합계 기준 부족액</dt>
          <dd>
            {result.total.remaining === null
              ? "내역 확인 필요"
              : won(result.total.remaining)}
          </dd>
        </div>
      </dl>
      {result.total.unpaired > 0 && (
        <p className="ledger-error">
          상대 거래와 연결되지 않은 이체가 {result.total.unpaired}건 있습니다.
          파일로 가져온 한쪽 기록만으로는 저축계좌 사이 이동을 구분할 수 없어
          부족액을 확정하지 않습니다.
        </p>
      )}
      {result.total.partial && (
        <p className="ledger-note">
          조회 월의 중간 이후부터 기록하는 계좌가 있어 월 전체 부족액은 계산하지
          않습니다.
        </p>
      )}
      <div className="ledger-stack">
        {result.accountRows.map((row) => (
          <article key={row.account.id} className="ledger-funding-goal">
            <h4>{row.account.name}</h4>
            <dl className="ledger-budget-breakdown">
              <div>
                <dt>월 계획</dt>
                <dd>{won(row.planned)}</dd>
              </div>
              <div>
                <dt>기록된 계좌 순이체</dt>
                <dd>{won(row.net)}</dd>
              </div>
              <div>
                <dt>계획까지 남은 금액</dt>
                <dd>
                  {row.remaining === null
                    ? "내역 확인 필요"
                    : won(row.remaining)}
                </dd>
              </div>
            </dl>
            {row.unpaired > 0 && (
              <p className="ledger-note">
                연결되지 않은 이체 {row.unpaired}건 · 잠정 실적
              </p>
            )}
            {row.partial && (
              <p className="ledger-note">
                기준일 {row.account.openingDate} · 월 전체 기록이 아닙니다.
              </p>
            )}
          </article>
        ))}
      </div>
      {!!result.goalRows.length && (
        <>
          <h4>목표별 이번 달 실적</h4>
          <div className="ledger-stack">
            {result.goalRows.map((row) => (
              <article key={row.goal.id} className="ledger-funding-goal">
                <h4>{row.goal.name}</h4>
                {!row.supported ? (
                  <p className="ledger-note">
                    저축·청약·ISA·연금 계좌만 연결한 목표의 납입 실적을
                    비교합니다.
                  </p>
                ) : (
                  <dl className="ledger-budget-breakdown">
                    <div>
                      <dt>월 계획</dt>
                      <dd>{won(row.planned)}</dd>
                    </div>
                    <div>
                      <dt>연결 계좌 순이체</dt>
                      <dd>{won(row.net)}</dd>
                    </div>
                    <div>
                      <dt>목표별 부족액</dt>
                      <dd>
                        {row.remaining === null
                          ? "내역 확인 필요"
                          : won(row.remaining)}
                      </dd>
                    </div>
                  </dl>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <p className="ledger-note">
        입금에서 출금을 뺀 계좌 이동만 집계합니다. 기준
        잔액·급여·이자·평가손익은 납입 실적에 더하지 않아요. 저축계좌 간 이동은
        전체 합계에서 상쇄되지만 계좌별·목표별 실적은 달라질 수 있습니다. 다른
        계좌의 초과 납입이 목표별 부족액을 자동으로 메우지는 않습니다.
      </p>
      <p className="ledger-note">
        가져오지 않은 거래는 포함되지 않습니다. 상대 계좌의 파일 이체를 자동으로
        연결하는 기능은 아직 없으며, 이미 가져온 이체를 직접 입력으로 다시
        추가하면 중복 기록됩니다.
      </p>
    </section>
  );
}
