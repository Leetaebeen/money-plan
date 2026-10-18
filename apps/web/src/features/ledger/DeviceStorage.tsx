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
      <details>
        <summary>휴대폰에서 사용하기 전 확인</summary>
        <h4>아이폰에 설치하기</h4>
        <ol>
          <li>
            Safari에서 머니플랜을 열고 공유 메뉴의 홈 화면에 추가를 선택하세요.
          </li>
          <li>
            웹 앱으로 열기 옵션이 보이면 켠 뒤 추가하세요. iOS 버전에 따라 메뉴
            위치가 다를 수 있어요.
          </li>
          <li>
            홈 화면의 머니플랜 아이콘으로 실행한 뒤 인터넷이 연결된 상태에서
            오프라인 준비를 마치세요.
          </li>
        </ol>
        <p className="ledger-note">
          <a
            href="https://support.apple.com/ko-kr/guide/iphone/iph42ab2f3a7/ios"
            target="_blank"
            rel="noopener noreferrer"
          >
            Apple의 홈 화면 추가 안내
          </a>
        </p>
        <h4>저장·오프라인 확인하기</h4>
        <ol>
          <li>
            사용할 기기에서 저장한 계좌·거래가 보이는지 먼저 확인하세요.
            데이터가 비어 있다면 기존 기기에서 백업한 파일을 옮겨 복원하세요.
          </li>
          <li>
            비행기 모드를 켜고 Wi-Fi도 꺼진 상태에서 홈 화면 아이콘으로 다시
            열어 저장된 내역을 확인하세요. 확인 후 연결을 다시 켜세요.
          </li>
          <li>
            저장한 암호화 백업을 아래 파일 검증으로 확인하세요. 브라우저나
            기기를 바꾸면 기존 데이터가 자동으로 옮겨지지 않습니다.
          </li>
        </ol>
        <p className="ledger-note">
          Android는 브라우저 메뉴의 앱 설치 또는 홈 화면 추가를 사용하세요.
          저장하지 않은 입력은 앱을 종료하면 사라질 수 있습니다.
        </p>
      </details>
    </section>
  );
}
