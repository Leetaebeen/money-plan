import { useEffect, useRef } from "react";

export function LeaveConfirmation({
  proceed,
  cancel,
}: {
  proceed: () => void;
  cancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ledger-leave-dialog"
      aria-labelledby="leave-title"
      aria-describedby="leave-description"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <h2 id="leave-title">입력 중인 내용을 유지할까요?</h2>
      <p id="leave-description">
        저장하지 않은 입력이 있습니다. 이동하면 이 입력은 사라집니다.
      </p>
      <div className="ledger-actions">
        <button
          autoFocus
          className="ledger-btn ledger-primary"
          onClick={cancel}
        >
          계속 작성
        </button>
        <button className="ledger-btn" onClick={proceed}>
          입력 버리고 이동
        </button>
      </div>
    </dialog>
  );
}
