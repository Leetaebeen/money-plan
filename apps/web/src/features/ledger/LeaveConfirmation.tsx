import { useEffect, useRef } from "react";

export function LeaveConfirmation({
  proceed,
  cancel,
  refresh = false,
}: {
  proceed: () => void;
  cancel: () => void;
  refresh?: boolean;
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
      <h2 id="leave-title">
        {refresh
          ? "최신 저장 내용을 불러올까요?"
          : "입력 중인 내용을 유지할까요?"}
      </h2>
      <p id="leave-description">
        {refresh
          ? "최신 내용을 불러오면 열려 있는 입력창과 조회 조건을 초기화합니다. 저장하지 않은 입력은 사라집니다."
          : "저장하지 않은 입력이 있습니다. 이동하면 이 입력은 사라집니다."}
      </p>
      <div className="ledger-actions">
        <button
          autoFocus
          className="ledger-btn ledger-primary"
          onClick={cancel}
        >
          {refresh ? "취소" : "계속 작성"}
        </button>
        <button className="ledger-btn" onClick={proceed}>
          {refresh ? "최신 내용 불러오기" : "입력 버리고 이동"}
        </button>
      </div>
    </dialog>
  );
}
