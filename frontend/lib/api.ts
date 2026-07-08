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

export type BenchQuery = {
  engine: string;
  ms: number;
  wallMs?: number;
  rows?: number;
  reached?: number;
  lines: number;
  query: string;
};

export type Benchmark = {
  question: string;
  cypher: BenchQuery;
  sql: BenchQuery;
  transitive: {
    question: string;
    seed: string;
    cypher: BenchQuery;
    sql: BenchQuery;
    match: boolean;
  };
  note: string;
};

export type PathResult = {
  found: boolean;
  from: string;
  to: string;
  hops?: number;
  nodeIds?: string[];
  readable?: string[];
  message?: string;
};

export type AskResult = {
  question: string;
  cypher: string;
  rows?: Record<string, any>[];
  rowCount?: number;
  answer?: string;
  error?: string;
  source: "llm" | "rules";
};

export type AccountRisk = {
  id: string;
  name: string;
  city: string;
  flagged: boolean;
  sharedLinks: number;
  txCount: number;
  flaggedTx: number;
  risk: number;
  band: "low" | "medium" | "high";
  factors: string[];
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
  benchmark: () => req<Benchmark>("/api/benchmark"),
  path: (from: string, to: string, mode: "all" | "infra" = "infra") =>
    req<PathResult>(`/api/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&mode=${mode}`),
  ask: (question: string) =>
    req<AskResult>("/api/ask", { method: "POST", body: JSON.stringify({ question }) }),
  account: (id: string) => req<AccountRisk>(`/api/account/${encodeURIComponent(id)}`),
  detect: () => req<DetectionResult>("/api/detect", { method: "POST" }),
  reset: () => req<{ ok: boolean }>("/api/reset", { method: "POST" }),
  injectFraudRing: (size = 6) =>
    req<{ injected: boolean; accountIds: string[] }>("/api/inject-fraud-ring", {
      method: "POST",
      body: JSON.stringify({ size }),
    }),
};
