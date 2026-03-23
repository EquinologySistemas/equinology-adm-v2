export interface Plan {
  id: string;
  name: string;
  description?: string;
  /** Limite configurado no plano (API: userQuantity). */
  maxUsers?: number;
  /** Empresas com assinatura ACTIVE ou TRIAL não expirada neste plano. */
  activeClientsCount?: number;
  priceCard?: number;
  pricePix?: number;
  active?: boolean;
  annualDiscountPercent?: number;
  trialDays?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountPercentage: number;
  discountFixedAmount: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  maxUsages: number | null;
  currentUsages: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Ad {
  id: string;
  name: string;
  redirectUrl: string;
  imageUrl: string;
  active?: boolean;
  displayOrder?: number;
  validFrom?: string;
  validUntil?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  companyId?: string;
  role?: string;
  status?: "active" | "blocked";
  planId?: string;
  planName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UserUpdatePayload {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  companyId?: string;
  newPassword?: string;
}

export interface UserCreatePayload {
  name: string;
  email: string;
  phone: string;
  role?: string;
  companyId: string;
  password: string;
}

export interface CompanyOption {
  id: string;
  name: string;
}

export interface Company {
  id: string;
  name: string;
  code?: string;
  cnpj?: string | null;
  address?: string;
  number?: string;
  postalCode?: string;
  walletId?: string | null;
  paymentId?: string;
  paymentType?: string;
  paymentResponsibleId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyUpdatePayload {
  name?: string;
  address?: string;
  number?: string;
  postalCode?: string;
  walletId?: string | null;
  cnpj?: string | null;
}

export interface CompanyCreatePayload {
  name: string;
  address?: string;
  number?: string;
  postalCode?: string;
  walletId?: string | null;
  cnpj?: string | null;
}

export interface Subscription {
  id: string;
  companyId: string;
  companyName?: string;
  companyPrimaryEmail?: string;
  planId: string;
  planName?: string;
  status: "ACTIVE" | "INACTIVE" | "TRIAL";
  expirationDate?: string;
  yearly?: boolean;
  createdAt: string;
}

export interface FinancialSummary {
  revenueMonth: number;
  revenuePreviousMonth: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
}

export interface SubscriptionTransaction {
  id: string;
  signatureId: string;
  companyName: string;
  planName: string;
  value: number;
  dueDate: string;
  paymentDate?: string;
  status: string;
  paymentMethod: string;
  createdAt: string;
}

// Mantido para compatibilidade, mas Transaction agora representa transações de assinaturas
export interface Transaction {
  id: string;
  signatureId?: string;
  companyName?: string;
  planName?: string;
  amount: number;
  status: "paid" | "pending" | "failed" | "refunded" | string;
  paymentMethod?: string;
  paidAt?: string;
  createdAt: string;
}

export interface Admin {
  id: string;
  email: string;
  name?: string;
  role?: string;
  active?: boolean;
  createdAt?: string;
}

export interface AdminCreatePayload {
  name: string;
  email: string;
  password: string;
  role?: string;
}

export interface AdminUpdatePayload {
  name?: string;
  email?: string;
  newPassword?: string;
  role?: string;
}
