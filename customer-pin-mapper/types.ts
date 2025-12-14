export interface CustomerPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  orderValue?: number; // Value of the order
  note?: string;
}

export interface AnalysisResult {
  summary: string;
  zones: string[];
  suggestion: string;
}
