import React from "react";
import { cn } from "@/lib/utils";

export interface TactileButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const TactileButton = React.forwardRef<
  HTMLButtonElement,
  TactileButtonProps
>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      icon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "h-9 px-3 text-xs gap-1.5 rounded-[12px]",
      md: "h-11 px-4 text-sm gap-2 rounded-rf min-h-[44px]",
      lg: "h-13 px-6 text-base gap-2.5 rounded-rf-md min-h-[48px]",
    }[size];

    const variantClasses = {
      primary: "tactile-button-primary",
      secondary: "tactile-button-secondary",
      danger: "tactile-button-danger",
      ghost:
        "bg-transparent hover:bg-slate-100 text-rf-text active:bg-slate-200 border border-transparent rounded-rf",
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "font-semibold transition-all inline-flex items-center justify-center select-none outline-none focus-visible:ring-2 focus-visible:ring-rf-blue focus-visible:ring-offset-2",
          sizeClasses,
          variantClasses,
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            <span>Memproses...</span>
          </>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
          </>
        )}
      </button>
    );
  }
);

TactileButton.displayName = "TactileButton";

