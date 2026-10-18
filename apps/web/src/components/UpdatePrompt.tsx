import { useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdatePrompt({
  beforeUpdate,
  blocked = false,
}: {
  beforeUpdate?: () => boolean | Promise<boolean>;
  blocked?: boolean;
} = {}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const updating = useRef(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () =>
      setError(
        "오프라인 실행 준비를 완료하지 못했어요. 인터넷 연결을 확인하고, 입력을 저장한 뒤 새로고침해 주세요.",
      ),
  });

  if (!needRefresh && !offlineReady && !error) return null;

  async function update() {
    if (blocked || updating.current) return;
    updating.current = true;
    setPending(true);
    setError(null);
    try {
      if (beforeUpdate && !(await beforeUpdate())) return;
      await updateServiceWorker(true);
    } catch {
      setError(
        "업데이트하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      updating.current = false;
      setPending(false);
    }
  }

  return (
    <aside
      className="update-toast"
      role="region"
      aria-labelledby="update-title"
    >
      <div>
        <strong id="update-title">
          {needRefresh
            ? "새 버전이 준비됐어요."
            : error
              ? "앱 준비 상태를 확인해 주세요."
              : "오프라인 실행 준비가 끝났어요."}
        </strong>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">
            {needRefresh
              ? "입력 중인 내용을 확인한 뒤 업데이트할 수 있어요."
              : "인터넷 없이 앱을 열 수 있어요. 휴대폰에서 비행기 모드로 다시 열어 확인해 주세요. 이 안내는 데이터 백업 완료를 뜻하지 않습니다."}
          </p>
        )}
      </div>
      <div className="update-toast__actions">
        {needRefresh && (
          <button
            type="button"
            disabled={blocked || pending}
            onClick={() => void update()}
          >
            {pending ? "확인 중…" : "업데이트"}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
            setError(null);
          }}
        >
          {needRefresh ? "나중에" : "닫기"}
        </button>
      </div>
    </aside>
  );
}
