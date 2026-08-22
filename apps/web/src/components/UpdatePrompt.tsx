import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <aside className="update-toast" role="status">
      <div>
        <strong>새 버전이 준비됐어요.</strong>
        <p>입력 중인 내용을 확인한 뒤 업데이트할 수 있어요.</p>
      </div>
      <div className="update-toast__actions">
        <button type="button" onClick={() => void updateServiceWorker(true)}>업데이트</button>
        <button type="button" onClick={() => setNeedRefresh(false)}>나중에</button>
      </div>
    </aside>
  );
}
