"use client";

import { cn } from "@/lib/utils";
import * as React from "react";

interface AuthLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  className?: string;
}

const AuthLabel = React.forwardRef<HTMLLabelElement, AuthLabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-sm leading-none font-medium text-[#27323F] peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  ),
);
AuthLabel.displayName = "AuthLabel";

export { AuthLabel };
