import React from "react";
import { TactileButton } from "./TactileButton";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center bg-white rounded-rf-md border border-dashed border-slate-300",
        className
      )}
    >
      {icon && (
        <div className="w-14 h-14 mb-3.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shadow-[inset_0_2px_4px_rgba(20,33,61,0.05)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-bold text-rf-text">{title}</h3>
      <p className="text-sm text-rf-text-secondary max-w-sm mt-1 mb-4 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <TactileButton variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </TactileButton>
      )}
    </div>
  );
};

