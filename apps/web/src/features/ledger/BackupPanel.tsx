import { useState } from "react";
import { decryptBackup, encryptBackup } from "./backup";
import { today, type Ledger, type LedgerSnapshot } from "./model";
import { restoreLedger } from "./store";
import { download } from "./shared";
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
  const [restore, setRestore] = useState<{
    data: Ledger;
    revision: number;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  async function exportData() {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      if (passphrase !== confirmPhrase)
        throw new Error("두 암호가 일치하지 않아요.");
      const content = await encryptBackup(snapshot.data, passphrase);
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
  async function inspect() {
    setWorking(true);
    setError("");
    setRestore(null);
    setConfirmed(false);
    try {
      if (!file) throw new Error("복원할 파일을 선택해 주세요.");
      if (file.size > 30_000_000)
        throw new Error("30MB 이하의 백업을 선택해 주세요.");
      const data = await decryptBackup(await file.text(), passphrase);
      setRestore({ data, revision: snapshot.revision });
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
      <div className="ledger-panel ledger-form">
        <fieldset disabled={busy || working}>
          <h3>암호화 백업</h3>
          <p className="ledger-note">
            계좌·거래·목표·월급 배분 계획·가져오기 이력을 포함합니다. 이전 월급
            계산기의 계획 이력은 해당 계산기에서 별도로 내보낼 수 있어요. 이
            암호는 저장하지 않으며 잊으면 복구할 수 없습니다.
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
          <h3>백업에서 복원</h3>
          <p className="ledger-note">
            위 암호 칸에 기존 백업 암호를 입력하고 파일을 선택하세요. 미리보기
            후 복원하면 현재 가계부를 교체합니다. 이전 계산기 이력은 유지됩니다.
          </p>
          <label>
            백업 파일
            <input
              type="file"
              accept=".moneyplan,.json"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setRestore(null);
                setConfirmed(false);
              }}
            />
          </label>
          <button
            className="ledger-btn"
            disabled={!file || !passphrase}
            onClick={() => void inspect()}
          >
            복원 내용 확인
          </button>
          {restore && (
            <div className="ledger-restore-preview">
              <h4>복원할 데이터</h4>
              <p>
                계좌 {restore.data.accounts.length}개 · 거래{" "}
                {restore.data.entries.length}건 · 목표{" "}
                {restore.data.goals.length}개 · 납부 일정{" "}
                {restore.data.schedules.length}개
              </p>
              <p>
                월급 배분 계획:{" "}
                {restore.data.monthlyPlan
                  ? "포함"
                  : "없음 (현재 월급 계획도 삭제됩니다)"}
              </p>
              <label className="ledger-checkbox">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                현재 가계부를 이 백업으로 교체합니다.
              </label>
              <div className="ledger-actions">
                <button
                  className="ledger-btn ledger-primary"
                  disabled={!confirmed}
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
