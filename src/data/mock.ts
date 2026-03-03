import type { Subscription, Transaction, User } from "@/types/admin";

export interface AuditLogMock {
  id: string;
  entity: string;
  entityId?: string;
  action: string;
  adminId?: string;
  adminEmail?: string;
  changes?: unknown;
  createdAt: string;
}

export interface AdminUserMock {
  id: string;
  email: string;
  name?: string;
  role?: string;
  active?: boolean;
  createdAt?: string;
}

export const mockSubscriptions: Subscription[] = [
  {
    id: "sub-1",
    userId: "u1",
    userName: "Maria Silva",
    userEmail: "maria.silva@haras.com.br",
    planId: "p1",
    planName: "Profissional",
    status: "active",
    currentPeriodStart: "2025-02-01",
    currentPeriodEnd: "2025-03-01",
    createdAt: "2024-06-15T10:00:00Z",
  },
  {
    id: "sub-2",
    userId: "u2",
    userName: "João Santos",
    userEmail: "joao@equiclinic.com",
    planId: "p2",
    planName: "Empresarial",
    status: "active",
    currentPeriodStart: "2025-02-10",
    currentPeriodEnd: "2025-03-10",
    createdAt: "2024-08-20T14:30:00Z",
  },
  {
    id: "sub-3",
    userId: "u3",
    userName: "Ana Oliveira",
    userEmail: "ana.oliveira@vetequus.com",
    planId: "p1",
    planName: "Profissional",
    status: "trial",
    currentPeriodStart: "2025-02-25",
    currentPeriodEnd: "2025-03-25",
    createdAt: "2025-02-25T09:00:00Z",
  },
  {
    id: "sub-4",
    userId: "u4",
    userName: "Carlos Mendes",
    userEmail: "carlos@haras.com.br",
    planId: "p2",
    planName: "Empresarial",
    status: "cancelled",
    currentPeriodStart: "2025-01-01",
    currentPeriodEnd: "2025-02-01",
    cancelledAt: "2025-02-15T12:00:00Z",
    createdAt: "2024-11-01T08:00:00Z",
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: "tx-1",
    subscriptionId: "sub-1",
    userId: "u1",
    amount: 149.9,
    status: "paid",
    paymentMethod: "Cartão de crédito",
    paidAt: "2025-02-01T10:15:00Z",
    createdAt: "2025-02-01T10:14:00Z",
  },
  {
    id: "tx-2",
    subscriptionId: "sub-2",
    userId: "u2",
    amount: 399.9,
    status: "paid",
    paymentMethod: "PIX",
    paidAt: "2025-02-10T09:00:00Z",
    createdAt: "2025-02-10T08:55:00Z",
  },
  {
    id: "tx-3",
    subscriptionId: "sub-3",
    userId: "u3",
    amount: 0,
    status: "pending",
    paymentMethod: "Trial",
    createdAt: "2025-02-25T09:00:00Z",
  },
  {
    id: "tx-4",
    subscriptionId: "sub-4",
    userId: "u4",
    amount: 399.9,
    status: "refunded",
    paymentMethod: "Cartão de crédito",
    paidAt: "2025-01-01T08:00:00Z",
    createdAt: "2025-01-01T07:58:00Z",
  },
  {
    id: "tx-5",
    userId: "u5",
    amount: 149.9,
    status: "failed",
    paymentMethod: "Cartão de crédito",
    createdAt: "2025-02-28T16:30:00Z",
  },
];

export const mockFinancialSummary = {
  mrr: 549.8,
  revenueMonth: 549.8,
  revenueYear: 6234.5,
};

export const mockAuditLogs: AuditLogMock[] = [
  {
    id: "log-1",
    entity: "plan",
    entityId: "p1",
    action: "updated",
    adminEmail: "admin@equinology.com",
    createdAt: "2025-03-02T14:22:00Z",
  },
  {
    id: "log-2",
    entity: "coupon",
    entityId: "c1",
    action: "created",
    adminEmail: "admin@equinology.com",
    createdAt: "2025-03-02T11:00:00Z",
  },
  {
    id: "log-3",
    entity: "user",
    entityId: "u3",
    action: "status_updated",
    adminEmail: "suporte@equinology.com",
    changes: { status: "active" },
    createdAt: "2025-03-01T17:45:00Z",
  },
  {
    id: "log-4",
    entity: "ad",
    entityId: "a1",
    action: "deleted",
    adminEmail: "admin@equinology.com",
    createdAt: "2025-03-01T10:30:00Z",
  },
  {
    id: "log-5",
    entity: "plan",
    entityId: "p2",
    action: "created",
    adminEmail: "admin@equinology.com",
    createdAt: "2025-02-28T09:15:00Z",
  },
];

export const mockAdmins: AdminUserMock[] = [
  {
    id: "admin-1",
    email: "admin@equinology.com",
    name: "Administrador Principal",
    role: "super_admin",
    active: true,
    createdAt: "2024-01-10T08:00:00Z",
  },
  {
    id: "admin-2",
    email: "suporte@equinology.com",
    name: "Equipe Suporte",
    role: "support",
    active: true,
    createdAt: "2024-06-01T12:00:00Z",
  },
];

export const mockDashboardKpis = {
  mrr: 549.8,
  subscriptionsActive: 3,
  subscriptionsNewMonth: 1,
  subscriptionsCancelledMonth: 1,
  churnRate: 25,
};

export const mockUsers: User[] = [
  {
    id: "u1",
    name: "Maria Silva",
    email: "maria.silva@haras.com.br",
    phone: "(11) 98765-4321",
    company: "Haras Silva",
    role: "Veterinária",
    status: "active",
    planName: "Profissional",
    createdAt: "2024-06-15T10:00:00Z",
  },
  {
    id: "u2",
    name: "João Santos",
    email: "joao@equiclinic.com",
    phone: "(21) 99876-5432",
    company: "EquiClinic",
    role: "Gestor",
    status: "active",
    planName: "Empresarial",
    createdAt: "2024-08-20T14:30:00Z",
  },
  {
    id: "u3",
    name: "Ana Oliveira",
    email: "ana.oliveira@vetequus.com",
    phone: "(31) 91234-5678",
    company: "VetEquus",
    role: "Administrador",
    status: "active",
    planName: "Profissional",
    createdAt: "2025-02-25T09:00:00Z",
  },
  {
    id: "u4",
    name: "Carlos Mendes",
    email: "carlos@haras.com.br",
    company: "Haras Mendes",
    status: "blocked",
    planName: "Empresarial",
    createdAt: "2024-11-01T08:00:00Z",
  },
];
