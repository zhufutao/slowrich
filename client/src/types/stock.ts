export interface Stock {
  id: string;
  code: string;
  name: string;
  market: 'SH' | 'SZ' | 'BJ';
  created_by?: string;
  created_at: string;
}

export interface CreateStockRequest {
  code: string;
  name: string;
  market: string;
}

export interface UpdateStockRequest {
  name: string;
  market: string;
}
