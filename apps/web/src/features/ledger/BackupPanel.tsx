import { compareBackup } from "./backup-comparison";
import { useEffect, useMemo, useState } from "react";
import { decryptBackup, encryptBackup } from "./backup";
import { today, type Ledger, type LedgerSnapshot } from "./model";
import { loadLedgerAtRevision, restoreLedger } from "./store";
import { download } from "./shared";
import { DeviceStorage } from "./DeviceStorage";
interface Props {
  snapshot: LedgerSnapshot;
  busy: boolean;
  run: (
    action: () => Promise<LedgerSnapshot>,
    message: string,
  ) => Promise<boolean>;
}
export function BackupPanel({ snapshot, busy, run }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [verification, setVerification] = useState<{
    revision: number;
    comparison: ReturnType<typeof compareBackup>;
  } | null>(null);
  const [restore, setRestore] = useState<{
    data: Ledger;
    revision: number;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const comparison = useMemo(
    () => (restore ? compareBackup(snapshot.data, restore.data) : null),
    [snapshot.data, restore],
  );
  const stale = restore !== null && restore.revision !== snapshot.revision;
  useEffect(() => {
    setConfirmed(false);
  }, [snapshot.revision]);
  async function exportData() {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      if (passphrase !== confirmPhrase)
        throw new Error("두 암호가 일치하지 않아요.");
      const current = await loadLedgerAtRevision(snapshot.revision);
      const content = await encryptBackup(current.data, passphrase);
      await loadLedgerAtRevision(current.revision);
      download(content, `money-plan-${today()}.moneyplan`);
      setNotice(
        "백업 파일 저장을 요청했어요. 다운로드 폴더에 파일이 있는지 확인해 주세요.",
      );
      setPassphrase("");
      setConfirmPhrase("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "백업을 만들지 못했어요.");
    } finally {
      setWorking(false);
    }
  }
  async function inspect(mode: "verify" | "restore") {
    setWorking(true);
    setError("");
    setNotice("");
    setVerification(null);
    setRestore(null);
    setConfirmed(false);
    try {
      if (!file) throw new Error("복원할 파일을 선택해 주세요.");
      if (file.size > 30_000_000)
        throw new Error("30MB 이하의 백업을 선택해 주세요.");
      const current = await loadLedgerAtRevision(snapshot.revision);
      const data = await decryptBackup(await file.text(), passphrase);
      await loadLedgerAtRevision(current.revision);
      if (mode === "restore") setRestore({ data, revision: current.revision });
      else
        setVerification({
          revision: current.revision,
          comparison: compareBackup(current.data, data),
        });
      setPassphrase("");
      setConfirmPhrase("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "백업을 읽지 못했어요.");
    } finally {
      setWorking(false);
    }
  }
  return (
    <section>
      <div className="ledger-section-title">
        <div>
          <h2>내 데이터 보관하기</h2>
          <p>기기 안의 가계부를 암호화된 파일로 보관하고 옮겨요.</p>
        </div>
      </div>
      <DeviceStorage />
      <div className="ledger-panel ledger-form">
        <fieldset disabled={busy || working}>
          <h3>암호화 백업</h3>
          <p className="ledger-note">
            계좌·거래·목표·월급 배분·월별 계획 이력·납부 일정·만기 계획·가져오기
            이력을 포함합니다. 이 암호는 저장하지 않으며 잊으면 복구할 수 없습니다.
          </p>
          <div className="ledger-fields">
            <label>
              백업 암호 (8자 이상)
              <input
                type="password"
                minLength={8}
                maxLength={256}
                autoComplete="off"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </label>
            <label>
              새 백업 암호 확인
              <input
                type="password"
                maxLength={256}
                autoComplete="off"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
              />
            </label>
          </div>
          <button
            className="ledger-btn ledger-primary"
            disabled={passphrase.length < 8}
            onClick={() => void exportData()}
          >
            암호화 백업 저장
          </button>
          <hr />
          <h3>저장한 백업 확인·복원</h3>
          <p className="ledger-note">
            위 암호 칸에 기존 백업 암호를 입력하고 파일을 선택하세요. 파일
            검증은 암호로 정상적으로 열리는지와 현재 가계부와의 차이만
            확인합니다. 복원은 미리보기 후 현재 가계부를 교체하며 이전 계산기
            이력은 유지됩니다.
          </p>
          <label>
            백업 파일
            <input
              type="file"
              accept=".moneyplan,.json"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setRestore(null);
                setVerification(null);
                setNotice("");
                setError("");
                setConfirmed(false);
              }}
            />
          </label>
          <button
            className="ledger-btn"
            disabled={!file || !passphrase}
            onClick={() => void inspect("verify")}
          >
            백업 파일 검증 (현재 데이터 유지)
          </button>
          <button
            className="ledger-btn"
            disabled={!file || !passphrase}
            onClick={() => void inspect("restore")}
          >
            복원 내용 확인
          </button>
          {verification && (
            <div className="ledger-restore-preview" role="status">
              <h4>백업 파일 검증 완료</h4>
              <p>
                암호화 파일을 열고 가계부 형식을 확인했습니다. 현재 데이터를
                변경하지 않았습니다.
              </p>
              {verification.revision !== snapshot.revision ? (
                <p className="ledger-note">
                  검증 이후 현재 데이터가 바뀌었습니다. 암호를 입력하고 다시
                  검증하면 최신 내용과 비교할 수 있습니다.
                </p>
              ) : verification.comparison.identical ? (
                <p>현재 가계부의 계좌·거래·계획과 내용이 일치합니다.</p>
              ) : (
                <>
                  <p>
                    파일은 읽을 수 있지만 현재 가계부와 내용이 다릅니다. 다른
                    시점의 백업일 수 있습니다.
                  </p>
                  <ul>
                    {verification.comparison.rows
                      .filter((row) => row.added || row.removed || row.changed)
                      .map((row) => (
                        <li key={row.key}>
                          {row.label}: 현재 {row.current} · 파일 {row.incoming}{" "}
                          · 현재에만 {row.removed} · 파일에만 {row.added} · 내용
                          다름 {row.changed}
                        </li>
                      ))}
                    {verification.comparison.planChanged && (
                      <li>월급 배분 계획이 다릅니다.</li>
                    )}
                  </ul>
                </>
              )}
              <p className="ledger-note">
                이 검증은 선택한 파일에만 적용됩니다. 실제 금융기관 기록의
                정확성이나 다른 기기의 복원 성공을 보장하지 않습니다.
              </p>
            </div>
          )}
          {restore && (
            <div className="ledger-restore-preview">
              <h4>복원할 데이터</h4>
              <p>
                계좌 {restore.data.accounts.length}개 · 거래{" "}
                {restore.data.entries.length}건 · 목표{" "}
                {restore.data.goals.length}개 · 납부 일정{" "}
                {restore.data.schedules.length}개 · 만기 계획{" "}
                {restore.data.maturities.length}개 · 월별 계획{" "}
                {restore.data.planHistory.length}개
              </p>
              <p>
                월급 배분 계획:{" "}
                {restore.data.monthlyPlan
                  ? "포함"
                  : "없음 (현재 월급 계획도 삭제됩니다)"}
              </p>
              {comparison && (
                <div>
                  <h4>현재 데이터와 비교</h4>
                  <p className="ledger-note">
                    합치기가 아니라 전체 교체입니다. 제외 항목은 현재 기기에서
                    사라지고, 변경 항목은 백업 내용으로 덮어씁니다. 식별자가
                    다른 같은 거래도 별개 항목으로 표시합니다.
                  </p>
                  {comparison.identical ? (
                    <p>현재 가계부와 백업의 내용이 같습니다.</p>
                  ) : (
                    <>
                      <div className="ledger-stack">
                        {comparison.rows.map((row) => (
                          <div className="ledger-funding-goal" key={row.key}>
                            <strong>
                              {row.label}: 현재 {row.current} → 백업{" "}
                              {row.incoming}
                            </strong>
                            <p>
                              추가 {row.added} · 변경 {row.changed} · 제외{" "}
                              {row.removed}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p>
                        월급 배분 계획:{" "}
                        {comparison.planChanged ? "백업 내용으로 변경" : "동일"}
                      </p>
                    </>
                  )}
                  <p className="ledger-note">
                    현재 데이터를 남기려면 위 암호와 확인 칸에 새 백업 암호를
                    입력한 뒤 아래 버튼으로 저장하세요. 다운로드한 파일을 확인한
                    후 복원할 수 있습니다.
                  </p>
                  <button
                    className="ledger-btn"
                    disabled={
                      passphrase.length < 8 || passphrase !== confirmPhrase
                    }
                    onClick={() => void exportData()}
                  >
                    현재 데이터 먼저 백업
                  </button>
                </div>
              )}
              {stale && (
                <p className="ledger-error" role="alert">
                  미리보기 이후 현재 데이터가 바뀌었습니다. 백업 암호를 다시
                  입력하고 복원 내용 확인을 눌러 비교를 갱신해 주세요.
                </p>
              )}
              <label className="ledger-checkbox">
                <input
                  type="checkbox"
                  disabled={stale}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                현재 가계부를 이 백업으로 교체합니다.
              </label>
              <div className="ledger-actions">
                <button
                  className="ledger-btn ledger-primary"
                  disabled={!confirmed || stale}
                  onClick={async () => {
                    if (
                      await run(
                        () => restoreLedger(restore.revision, restore.data),
                        "백업을 복원했어요.",
                      )
                    ) {
                      setRestore(null);
                      setConfirmed(false);
                      setFile(null);
                    }
                  }}
                >
                  확인한 백업으로 복원
                </button>
                <button className="ledger-btn" onClick={() => setRestore(null)}>
                  취소
                </button>
              </div>
            </div>
          )}
          {working && <p role="status">암호화 데이터를 처리하고 있어요…</p>}
          {error && (
            <p className="ledger-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="ledger-notice" role="status">
              {notice}
            </p>
          )}
        </fieldset>
      </div>
    </section>
  );
}
