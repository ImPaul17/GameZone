export type BatchStatus = "queued" | "running" | "paused" | "completed";
export type BatchItemStatus = "pending" | "processing" | "imported" | "skipped" | "failed";

export interface BatchItem {
  id: string;
  url: string;
  status: BatchItemStatus;
  attempts: number;
  recordId?: string;
  title?: string;
  message?: string;
  warnings?: string[];
}

export interface BatchSummary {
  id: string;
  status: BatchStatus;
  total: number;
  done: number;
  createdAt: string;
  updatedAt: string;
}

export interface BatchDetail extends BatchSummary {
  items: BatchItem[];
  retryAt?: string;
}

export interface BatchDiscovery {
  urls: string[];
  sitemaps: string[];
  source: string;
  message: string;
}
