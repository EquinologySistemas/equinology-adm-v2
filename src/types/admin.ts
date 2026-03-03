export interface Plan {
  id: string;
  name: string;
  description?: string;
  maxUsers?: number;
  priceCard?: number;
  pricePix?: number;
  active?: boolean;
  annualDiscountPercent?: number;
  trialDays?: number;
  displayOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  validFrom?: string;
  validUntil?: string;
  maxUses?: number;
  maxUsesPerUser?: number;
  currentUses?: number;
  active?: boolean;
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
  role?: string;
  status?: "active" | "blocked";
  planId?: string;
  planName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  planId: string;
  planName?: string;
  status: "active" | "cancelled" | "trial" | "past_due";
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelledAt?: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  subscriptionId?: string;
  userId?: string;
  amount: number;
  status: "paid" | "pending" | "failed" | "refunded";
  paymentMethod?: string;
  paidAt?: string;
  createdAt: string;
}
