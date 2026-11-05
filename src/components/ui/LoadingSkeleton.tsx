import React from "react";
import { cn } from "@/lib/utils";

export const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200/80 shadow-[inset_0_1px_2px_rgba(20,33,61,0.04)]",
        className
      )}
      {...props}
    />
  );
};

export const BookingCardSkeleton: React.FC = () => {
  return (
    <div className="tactile-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="space-y-3 pt-2">
        <div className="flex gap-3">
          <Skeleton className="h-4 w-4 rounded-full shrink-0" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-4 w-4 rounded-full shrink-0" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-9 w-28 rounded-rf" />
      </div>
    </div>
  );
};

