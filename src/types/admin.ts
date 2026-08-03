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

export type AdScope = "GLOBAL" | "REGIONAL" | "MUNICIPAL";

export interface AdCityTarget {
  uf: string;
  city: string;
}

export interface Ad {
  id: string;
  name: string;
  description?: string | null;
  redirectUrl: string;
  imageUrl: string;
  active?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  scope?: AdScope;
  targetStates?: string[];
  targetCities?: AdCityTarget[];
  createdAt?: string;
  updatedAt?: string;
}

export type TutorialType = "VIDEO" | "PDF";

export interface TutorialChapter {
  title: string;
  description?: string | null;
  timecode?: string | null;
  sortOrder?: number;
}

export interface Tutorial {
  id: string;
  type: TutorialType;
  title: string;
  description?: string | null;
  /** URL do conteúdo principal (vídeo ou PDF) */
  mediaUrl: string;
  videoUrl?: string | null;
  fileUrl?: string | null;
  posterUrl?: string | null;
  captionsUrl?: string | null;
  durationLabel?: string | null;
  active?: boolean;
  isActive?: boolean;
  featured?: boolean;
  sortOrder?: number;
  chapters?: TutorialChapter[];
  createdAt?: string;
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
  /**
   * Pagamentos liquidados que o provedor devolveu sem data de liquidação.
   * Não entram na receita do mês — o painel avisa em vez de chutar o mês.
   */
  settledWithoutDate: number;
  /**
   * Assinaturas que o provedor de pagamento não respondeu na consulta. Os
   * pagamentos delas ficaram fora da receita: com este número maior que zero,
   * o total mostrado está incompleto.
   */
  signaturesNotRead: number;
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
  active?: boolean;
}
