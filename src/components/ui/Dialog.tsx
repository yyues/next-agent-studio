"use client";

import { useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

// 通用弹窗：遮罩点击关闭 + ESC 关闭 + 阻止背景滚动
// 修复：用 mousedown/mouseup 追踪，防止滚动内容时 click 逃出弹窗
export function Dialog({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleOverlayMouseDown(e: React.MouseEvent) {
    // 只有 mousedown 发生在遮罩（非弹窗内容）上时，才标记为可能关闭
    mouseDownOnOverlay.current = true;
  }

  function handleDialogMouseDown(e: React.MouseEvent) {
    // mousedown 在弹窗内容上，点击绝不应关闭
    mouseDownOnOverlay.current = false;
  }

  function handleOverlayMouseUp(e: React.MouseEvent) {
    // 只有 mousedown 也在遮罩上时，才触发关闭
    if (mouseDownOnOverlay.current) {
      onClose();
    }
    mouseDownOnOverlay.current = false;
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
    >
      <div
        ref={dialogRef}
        className={`bg-white rounded-xl shadow-lg w-full ${maxWidth} p-5 max-h-[90vh] overflow-y-auto`}
        onMouseDown={handleDialogMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        {children}
      </div>
    </div>
  );
}
