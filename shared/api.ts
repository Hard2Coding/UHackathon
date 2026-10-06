export type RiskLevel =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INSUFFICIENT_DATA"
  | "INSUFFICIENT DATA";
export type Entity = {
  id: string;
  type: string;
  value: string;
  masked_value?: string;
};
export type GraphNode = {
  id: string;
  label?: string;
  value?: string;
  type: string;
  is_sample?: boolean;
  report_status?: string;
  [key: string]: unknown;
};
export type GraphEdge = {
  id?: string;
  source: string;
  target: string;
  relationship?: string;
  source_name?: string;
  evidence?: string;
  created_at?: string;
  [key: string]: unknown;
};
export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  features?: Record<string, unknown>;
  is_sample?: boolean;
};
export type Analysis = {
  id: string;
  checked_at: string;
  input_kind: string;
  score: number | null;
  level: RiskLevel;
  summary: string;
  entities: Entity[];
  reasons: { code: string; title: string; detail: string; source: string }[];
  history: { status: string; matches: Record<string, unknown>[] };
  graph: GraphData;
  missing_data: string[];
  model: {
    version: string;
    status: string | Record<string, unknown>;
    components?: Record<string, unknown>;
    dataset_is_sample: boolean;
  };
  similar_examples: {
    text: string;
    source: string;
    similarity: number;
    method: string;
    is_sample: boolean;
  }[];
  contributions: {
    feature: string;
    value: number;
    unit: string;
    model: string;
  }[];
  advice: string[];
  thresholds: Record<string, number>;
  anomaly?: Record<string, unknown>;
  [key: string]: unknown;
};
export type User = {
  id: string;
  email: string;
  email_is_placeholder?: boolean;
  name?: string;
  display_name?: string;
  role: "user" | "admin";
};
export type Job = {
  id: string;
  status: string;
  result?: unknown;
  error?: string;
  progress?: number;
  [key: string]: unknown;
};
