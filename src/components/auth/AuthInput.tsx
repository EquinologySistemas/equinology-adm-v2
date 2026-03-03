"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AuthInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
}

const AuthInput = React.forwardRef<HTMLInputElement, AuthInputProps>(
  ({ className, type, leftIcon, ...props }, ref) => (
    <div className="relative w-full">
      {leftIcon && (
        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-[#27323F]/50 [&>svg]:h-5 [&>svg]:w-5">
          {leftIcon}
        </span>
      )}
      <input
        type={type}
        className={cn(
          "flex w-full rounded-xl border border-[#27323F]/20 bg-white px-4 py-3 text-[#27323F] transition placeholder:text-[#27323F]/50",
          "focus:border-[#154734] focus:ring-2 focus:ring-[#154734]/30 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          leftIcon && "pl-10",
          className,
        )}
        ref={ref}
        {...props}
      />
    </div>
  ),
);
AuthInput.displayName = "AuthInput";

export { AuthInput };
