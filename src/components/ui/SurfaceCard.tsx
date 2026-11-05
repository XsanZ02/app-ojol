import React from "react";
import { cn } from "@/lib/utils";

export interface SurfaceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  elevation?: "subtle" | "normal" | "inset" | "flat";
}

export const SurfaceCard = React.forwardRef<HTMLDivElement, SurfaceCardProps>(
  (
    { className, interactive = false, elevation = "normal", children, ...props },
    ref
  ) => {
    const elevationClasses = {
      subtle:
        "bg-white border border-slate-200/90 shadow-[0_1px_3px_rgba(20,33,61,0.03),inset_0_1px_0_#ffffff]",
      normal: interactive ? "tactile-card-interactive" : "tactile-card",
      inset:
        "bg-[#f8fafc] border border-slate-200 shadow-[inset_0_2px_4px_rgba(20,33,61,0.04)]",
      flat: "bg-white border border-slate-200",
    }[elevation];

    return (
      <div
        ref={ref}
        className={cn("rounded-rf-md p-5", elevationClasses, className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SurfaceCard.displayName = "SurfaceCard";

