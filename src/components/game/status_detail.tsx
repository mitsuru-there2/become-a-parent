import { useEffect, useRef, type ReactNode } from "react";

/** Native modal keeps the background inert and restores focus to its opener. */
export function StatusDetail({
  title,
  onClose,
  children,
  variant = "dialog",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  variant?: "dialog" | "sheet";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`status-detail${variant === "sheet" ? " member-sheet" : ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="閉じる" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="status-detail-body">{children}</div>
      <footer>
        <button onClick={onClose}>閉じる</button>
      </footer>
    </dialog>
  );
}
