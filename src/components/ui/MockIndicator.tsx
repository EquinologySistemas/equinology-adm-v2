"use client";

import { Beaker } from "lucide-react";

type Variant = "banner" | "badge" | "inline";

interface MockIndicatorProps {
  variant?: Variant;
  className?: string;
}

export function MockIndicator({ variant = "banner", className = "" }: MockIndicatorProps) {
  const label = "Dados demonstrativos (mock) para validação de UX/UI";

  if (variant === "badge") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 ${className}`}
        title={label}
      >
        <Beaker className="h-3.5 w-3.5" aria-hidden />
        Mock
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-xs text-amber-700 ${className}`}
        title={label}
      >
        <Beaker className="h-3.5 w-3.5" aria-hidden />
        Mock
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-label={label}
      className={`flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ${className}`}
    >
      <Beaker className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
