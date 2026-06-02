import React, { useState, useRef, useEffect } from "react";

interface Props {
  productId: string;
  productName: string;
}

export default function DeleteConfirmDialog({ productId, productName }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleConfirm() {
    const response = await fetch(`/api/products/${productId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      window.location.href = "/inventory";
    } else {
      const errorMsg = await response.text();
      window.location.href = `/inventory?error=${errorMsg}`;
    }
  }

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => {
          setOpen(true);
        }}
        className="rounded border border-red-400/30 px-2 py-1 text-xs text-red-400 hover:bg-red-400/10"
      >
        Delete
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6 text-white shadow-xl">
            <h2 id="delete-dialog-title" className="mb-2 text-lg font-semibold">
              Delete product?
            </h2>
            <p className="mb-6 text-sm text-blue-100/70">
              This will permanently delete <strong>{productName}</strong>. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                ref={cancelRef}
                onClick={handleClose}
                className="flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium transition-colors hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
