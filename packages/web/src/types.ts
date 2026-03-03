export interface AdminUserItem {
  id: string;
  email: string;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  balance: number;
  usageSummary: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    lastUsedAt: string | null;
  };
}

export interface PagedUsers {
  page: number;
  pageSize: number;
  total: number;
  items: AdminUserItem[];
}

export interface AdminUserDetail extends AdminUserItem {}

export interface RedeemCodeItem {
  code: string;
  tokenAmount: number;
  createdBy: string | null;
  redeemedBy: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface UsageLogItem {
  id: string;
  userId: string;
  apiKeyId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  provider: string;
  upstreamStatus: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AdminStats {
  usersTotal: number;
  activeApiKeys: number;
  redeemCodes: {
    used: number;
    unused: number;
    total: number;
  };
  totalCost: number;
  trends: {
    last7Days: Array<{ date: string; requestCount: number; totalCost: number }>;
    last30Days: Array<{ date: string; requestCount: number; totalCost: number }>;
  };
}
