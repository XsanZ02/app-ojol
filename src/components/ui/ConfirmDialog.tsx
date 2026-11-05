"use client";

import React, { useEffect } from "react";
import { TactileButton } from "./TactileButton";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  isLoading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  variant = "primary",
  isLoading = false,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="w-full max-w-md bg-white rounded-rf-xl border border-slate-200 shadow-tactile-float p-6 relative animate-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          aria-label="Tutup dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4 mb-5">
          <div
            className={cn(
              "w-11 h-11 rounded-rf flex items-center justify-center shrink-0 border",
              variant === "danger"
                ? "bg-rose-50 border-rose-200 text-rose-600 shadow-[inset_0_1px_0_#ffffff]"
                : "bg-blue-50 border-blue-200 text-rf-blue shadow-[inset_0_1px_0_#ffffff]"
            )}
          >
            <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h3
              id="dialog-title"
              className="text-base font-bold text-rf-text"
            >
              {title}
            </h3>
            <p className="text-sm text-rf-text-secondary mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <TactileButton
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </TactileButton>
          <TactileButton
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </TactileButton>
        </div>
      </div>
    </div>
  );
};

