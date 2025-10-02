/**
 * src/components/utility/WarningDialog.tsx
 *
 * A reusable full-screen modal warning dialog.
 * Use instead of window.confirm for destructive actions.
 */

import React from "react";

interface WarningDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const WarningDialog: React.FC<WarningDialogProps> = ({
  isOpen,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 2000,
      }}
    >
      <div
        style={{
          background: "#2b0000",
          padding: "2rem",
          borderRadius: 10,
          maxWidth: 500,
          width: "90%",
          color: "white",
          boxShadow: "0 0 20px rgba(0,0,0,0.5)",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "1rem", color: "#ff5555" }}>
          {title}
        </h2>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, textAlign: "center" }}>{message}</p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "2rem" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #888",
              background: "#333",
              color: "white",
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#cc0000",
              fontWeight: "bold",
              color: "white",
              cursor: "pointer",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WarningDialog;
