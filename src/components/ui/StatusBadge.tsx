import React from "react";
import { BookingStatus } from "@/types/booking";
import { getStatusBadgeConfig } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: BookingStatus;
  size?: "sm" | "md";
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = "md",
  className,
}) => {
  const { label, badgeClass, dotClass } = getStatusBadgeConfig(status);

  return (
    <span
      className={cn(
        "tactile-badge",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        badgeClass,
        className
      )}
    >
      <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
      <span>{label}</span>
    </span>
  );
};

