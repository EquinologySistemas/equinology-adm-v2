"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface AuthButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

const AuthButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  ({ className, disabled, ...props }, ref) => (
    <button
      type="submit"
      ref={ref}
      disabled={disabled}
      aria-busy={disabled}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#154734] px-4 py-3 font-semibold whitespace-nowrap text-white opacity-100 transition hover:opacity-95",
        "focus-visible:ring-2 focus-visible:ring-[#154734]/30 focus-visible:ring-offset-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
AuthButton.displayName = "AuthButton";

export { AuthButton };
