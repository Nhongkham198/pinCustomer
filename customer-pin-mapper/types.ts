export interface CustomerPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  orderValue?: number; // Value of the order
  note?: string;
}

export interface DeliveryRecord {
  id: string;
  customerName: string;
  timestamp: string; // ISO String
  photoUrl: string; // Base64 image
  location: { lat: number, lng: number };
}

export interface AnalysisResult {
  summary: string;
  zones: string[];
  suggestion: string;
}

// Interface สำหรับสั่งงาน MapViewer จากภายนอก (ผ่าน Ref)
export interface MapViewerHandle {
  toggleTracking: () => void;
  resetToShop: () => void;
}