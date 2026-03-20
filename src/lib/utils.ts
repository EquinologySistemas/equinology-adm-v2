import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Máscara de telefone: (00) 00000-0000 ou (00) 0000-0000 (baseado em equinology-web-v2/lib/masks) */
function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function unmaskPhone(value: string): string {
  return onlyDigits(value).slice(0, 11);
}

/** CEP: 00000-000 (8 dígitos) */
export function formatCEP(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function unmaskCEP(value: string): string {
  return onlyDigits(value).slice(0, 8);
}

/** CNPJ: 00.000.000/0000-00 (14 dígitos) */
export function formatCNPJ(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function unmaskCNPJ(value: string): string {
  return onlyDigits(value).slice(0, 14);
}

/**
 * Formata centavos para exibição em BRL (vírgula decimal).
 * Ex.: 0 → "0,00", 100 → "1,00", 199 → "1,99", 10050 → "100,50"
 */
export function formatPriceFromCents(cents: number): string {
  const c = Math.floor(Number(cents)) || 0;
  const reais = Math.floor(c / 100);
  const centavos = c % 100;
  return `${reais},${String(centavos).padStart(2, "0")}`;
}

/**
 * Extrai apenas dígitos do valor e interpreta como centavos.
 * Ex.: "1,00" ou "100" → 100
 */
export function parsePriceToCents(value: string): number {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits === "" ? 0 : parseInt(digits, 10);
}
