const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type Stats = {
  accounts: number;
  transactions: number;
  rings: number;
  flaggedAccounts: number;
};

export type GraphNode = {
  id: string;
  name: string;
  city: string;
  flagged: boolean;
  injected: boolean;
  devices: string[];
  ips: string[];
};

export type GraphEdge = { source: string; target: string; amount: number };

export type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };

export type Ring = {
  id: string;
  detected_at: string | null;
  confidence: number;
  explanation: string;
  size: number;
  member_ids: string[];
};

export type DetectionResult = {
  rings: {
    ring_id: string;
    member_ids: string[];
    size: number;
    shared_attributes: { type: string; id: string; accountCount: number }[];
    internal_transactions: number;
    internal_transaction_volume: number;
    density_ratio: number;
    confidence_score: number;
    explanation: string;
  }[];
  sharedEdgeCount?: number;
  clustersEvaluated?: number;
  message?: string;
};

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

export const api = {
  health: () => req<{ ok: boolean }>("/api/health"),
  stats: () => req<Stats>("/api/stats"),
  graph: (limit = 600) => req<GraphData>(`/api/graph?limit=${limit}`),
  rings: () => req<Ring[]>("/api/rings"),
  detect: () => req<DetectionResult>("/api/detect", { method: "POST" }),
  injectFraudRing: (size = 6) =>
    req<{ injected: boolean; accountIds: string[] }>("/api/inject-fraud-ring", {
      method: "POST",
      body: JSON.stringify({ size }),
    }),
};
