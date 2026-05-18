export type DownloadStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

export interface DownloadTask {
  id: string;
  stock_id: string;
  stock_name: string;
  start_date: string;
  end_date: string;
  data_source: string;
  actual_source?: string;
  status: DownloadStatus;
  progress: number;
  downloaded_days: number;
  total_days: number;
  last_downloaded_date?: string;
  error_msg?: string | null;
  created_at: string;
}

export interface CreateDownloadTaskRequest {
  stock_id: string;
  start_date: string;
  end_date: string;
  data_source?: 'auto' | 'akshare' | 'tushare';
}
