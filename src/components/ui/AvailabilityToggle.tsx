"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Power } from "lucide-react";

interface AvailabilityToggleProps {
  isOnline: boolean;
  onToggle: () => void;
  disabled?: boolean;
  loading?: boolean;
  unavailable?: boolean;
  className?: string;
}

export const AvailabilityToggle: React.FC<AvailabilityToggleProps> = ({
  isOnline,
  onToggle,
  disabled = false,
  loading = false,
  unavailable = false,
  className,
}) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 p-2 bg-white rounded-rf border border-slate-200/90 shadow-[0_1px_3px_rgba(20,33,61,0.04),inset_0_1px_0_#ffffff]",
        className
      )}
    >
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-rf-text uppercase tracking-wider">
          Status Pengemudi
        </span>
        <span
          className={cn(
            "text-xs font-medium transition-colors",
            isOnline ? "text-emerald-700 font-semibold" : "text-rf-text-secondary"
          )}
        >
          {unavailable
            ? "Status tidak tersedia"
            : loading
              ? "Memuat status..."
            : isOnline
              ? "ONLINE — Siap Terima Order"
              : "OFFLINE — Istirahat"}
        </span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isOnline}
        aria-label={
          unavailable
            ? "Status ketersediaan pengemudi tidak tersedia"
            : "Ubah status ketersediaan pengemudi"
        }
        aria-busy={loading}
        disabled={disabled || loading || unavailable}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2",
          isOnline
            ? "bg-emerald-600 shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)]"
            : "bg-slate-300 shadow-[inset_0_2px_4px_rgba(20,33,61,0.15)]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="sr-only">Toggle availability</span>
        <span
          className={cn(
            "pointer-events-none flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.25),inset_0_1px_0_#ffffff] transition duration-200 ease-in-out",
            isOnline ? "translate-x-8 text-emerald-600" : "translate-x-0 text-slate-400"
          )}
        >
          <Power className="w-3.5 h-3.5 stroke-[2.5]" />
        </span>
      </button>
    </div>
  );
};
