import React from "react";
import { BookingStatus, StatusHistoryItem } from "@/types/booking";
import { Check, Clock, Car, Navigation, Flag, XCircle } from "lucide-react";
import { cn, formatTimeOnly } from "@/lib/utils";

interface TripTimelineProps {
  status: BookingStatus;
  statusHistory?: StatusHistoryItem[];
  orientation?: "vertical" | "horizontal";
  className?: string;
}

const STEPS: { status: BookingStatus; label: string; icon: React.ElementType }[] = [
  { status: "PENDING", label: "Menunggu Pengemudi", icon: Clock },
  { status: "ACCEPTED", label: "Pengemudi Ditemukan", icon: Check },
  { status: "PICKING_UP", label: "Menuju Lokasi Jemput", icon: Navigation },
  { status: "IN_PROGRESS", label: "Dalam Perjalanan", icon: Car },
  { status: "COMPLETED", label: "Perjalanan Selesai", icon: Flag },
];

export const TripTimeline: React.FC<TripTimelineProps> = ({
  status,
  statusHistory = [],
  orientation = "vertical",
  className,
}) => {
  // If cancelled, show special cancelled state
  if (status === "CANCELLED") {
    const cancelHistory = statusHistory.find((h) => h.status === "CANCELLED");
    return (
      <div className={cn("p-4 bg-rose-50 border border-rose-200 rounded-rf flex items-start gap-3", className)}>
        <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
          <XCircle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-rose-900">Pesanan Dibatalkan</h4>
          <p className="text-xs text-rose-700 mt-0.5">
            {cancelHistory?.note || "Pesanan telah dibatalkan."}
          </p>
          {cancelHistory && (
            <p className="text-[11px] text-rose-600/80 mt-1 font-mono">
              Waktu: {formatTimeOnly(cancelHistory.timestamp)}
            </p>
          )}
        </div>
      </div>
    );
  }

  const currentStepIndex = STEPS.findIndex((s) => s.status === status);

  if (orientation === "horizontal") {
    return (
      <div className={cn("w-full py-4", className)}>
        <div className="relative flex items-center justify-between">
          {/* Background Track */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-200 z-0" />
          {/* Active Track */}
          <div
            className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-rf-blue z-0 transition-all duration-300"
            style={{
              width: `${(Math.max(0, currentStepIndex) / (STEPS.length - 1)) * 100}%`,
            }}
          />

          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentStepIndex || status === "COMPLETED";
            const isCurrent = idx === currentStepIndex && status !== "COMPLETED";
            const historyItem = statusHistory.find((h) => h.status === step.status);
            const Icon = step.icon;

            return (
              <div
                key={step.status}
                className="relative z-10 flex flex-col items-center"
              >
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center transition-all border-2",
                    isCompleted &&
                      "bg-rf-blue border-white text-white shadow-tactile-btn",
                    isCurrent &&
                      "bg-white border-rf-blue text-rf-blue shadow-tactile-card ring-4 ring-blue-100 animate-pulse",
                    !isCompleted &&
                      !isCurrent &&
                      "bg-white border-slate-300 text-slate-400"
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span
                  className={cn(
                    "text-xs mt-2 font-medium text-center max-w-[80px] hidden md:block",
                    isCurrent && "font-bold text-rf-blue",
                    isCompleted && "text-rf-text font-semibold",
                    !isCompleted && !isCurrent && "text-slate-400"
                  )}
                >
                  {step.label}
                </span>
                {historyItem && (
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5 hidden md:block">
                    {formatTimeOnly(historyItem.timestamp)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Vertical Timeline
  return (
    <div className={cn("space-y-4 relative", className)}>
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentStepIndex || (status === "COMPLETED" && idx <= currentStepIndex);
        const isCurrent = idx === currentStepIndex && status !== "COMPLETED";
        const historyItem = statusHistory.find((h) => h.status === step.status);
        const Icon = step.icon;

        return (
          <div key={step.status} className="flex items-start gap-3.5 relative">
            {/* Vertical connector line */}
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "absolute left-4 top-8 -bottom-3 w-0.5 -translate-x-1/2 z-0",
                  isCompleted ? "bg-rf-blue" : "bg-slate-200"
                )}
              />
            )}

            {/* Step Marker */}
            <div
              className={cn(
                "relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all",
                isCompleted &&
                  "bg-rf-blue border-white text-white shadow-tactile-btn",
                isCurrent &&
                  "bg-white border-rf-blue text-rf-blue shadow-tactile-card ring-4 ring-blue-100",
                !isCompleted &&
                  !isCurrent &&
                  "bg-white border-slate-300 text-slate-400 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>

            {/* Step Content */}
            <div className="pt-0.5 flex-1 flex items-start justify-between">
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    isCurrent && "font-bold text-rf-blue",
                    isCompleted && "text-rf-text font-semibold",
                    !isCompleted && !isCurrent && "text-slate-400"
                  )}
                >
                  {step.label}
                </p>
                {historyItem?.note && (
                  <p className="text-xs text-rf-text-secondary mt-0.5">
                    {historyItem.note}
                  </p>
                )}
              </div>
              {historyItem && (
                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-[inset_0_1px_1px_rgba(0,0,0,0.05)]">
                  {formatTimeOnly(historyItem.timestamp)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

