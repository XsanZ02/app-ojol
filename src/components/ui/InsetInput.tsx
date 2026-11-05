import React from "react";
import { cn } from "@/lib/utils";

export interface InsetInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const InsetInput = React.forwardRef<HTMLInputElement, InsetInputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-rf-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-rf-text-muted">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full h-11 px-3.5 text-sm tactile-inset-input placeholder:text-slate-400 font-medium",
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error && "border-rose-400 focus:border-rose-500 focus:ring-rose-200",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 flex items-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error ? (
          <p className="text-xs text-rose-600 font-medium pl-0.5">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-rf-text-muted pl-0.5">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

InsetInput.displayName = "InsetInput";

