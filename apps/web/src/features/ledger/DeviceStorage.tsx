import { useEffect, useRef, useState } from "react";
import {
  readStorageProtection,
  requestStorageProtection,
  type StorageProtection,
} from "./storage-protection";

const descriptions: Record<StorageProtection, string> = {
  protected:
    "브라우저가 저장 공간 부족 시 자동 정리하지 않도록 보호하고 있습니다.",
  standard:
    "일반 저장 상태입니다. 저장 공간이 부족하면 브라우저가 데이터를 정리할 수 있습니다.",
  unsupported:
    "이 브라우저에서는 저장 보호 상태 확인 또는 요청 기능이 지원되지 않습니다.",
  error:
    "저장 보호 상태를 확인하지 못했습니다. 브라우저의 저장 공간 설정을 확인해 주세요.",
};

export function DeviceStorage() {
  const [status, setStatus] = useState<StorageProtection | null>(null);
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    void readStorageProtection(navigator.storage).then((value) => {
      if (active) setStatus(value);
    });
    return () => {
      active = false;
    };
  }, []);
  async function protect() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      setStatus(await requestStorageProtection(navigator.storage));
      setRequested(true);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <section className="ledger-panel" aria-label="이 기기의 저장 보호">
      <h3>이 기기의 저장 보호</h3>
      <p role="status">
        {status ? descriptions[status] : "저장 보호 상태를 확인하고 있어요…"}
      </p>
      {status !== null &&
        status !== "protected" &&
        typeof navigator.storage?.persist === "function" && (
          <button
            className="ledger-btn"
            disabled={pending}
            onClick={() => void protect()}
          >
            {pending ? "요청 중…" : "자동 정리로부터 저장 데이터 보호 요청"}
          </button>
        )}
      {requested && status === "standard" && (
        <p className="ledger-note">
          브라우저가 보호 요청을 승인하지 않았습니다. 기존 가계부는 그대로
          유지됩니다.
        </p>
      )}
      <p className="ledger-note">
        보호 설정은 백업이나 기기 간 동기화가 아닙니다. 직접 사이트 데이터를
        지우거나 기기를 바꾸기 전에는 암호화 백업 파일을 보관하세요.
      </p>
    </section>
  );
}
