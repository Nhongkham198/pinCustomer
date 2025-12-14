import React, { useState } from 'react';
import { CustomerPoint } from '../types';
import { Plus, Table, Trash2, HelpCircle, Download, FileText, ExternalLink, X } from 'lucide-react';

interface DataInputProps {
  onDataParsed: (data: CustomerPoint[], append: boolean) => void;
  points: CustomerPoint[];
}

// ลิงก์ Google Sheet ของลูกค้า
const USER_SHEET_URL = "https://docs.google.com/spreadsheets/d/1eQWLde46dv8wQgm9dxZKDp-2uq_aK1oMfkpYGWL0gp0/edit?gid=0#gid=0";

// ตัวอย่างข้อมูล
const SAMPLE_DATA = `2025-12-14	06:34:59	#01	คุณต้น	...	...	...	https://www.google.com/maps?q=16.440272,103.497242
2025-12-14	06:40:00	#02	คุณหญิง	...	...	...	https://www.google.com/maps?q=16.435000,103.500000
2025-12-14	07:00:23	#03	ร้านกาแฟ A	...	...	...	https://www.google.com/maps?q=16.445000,103.490000`;

export const DataInput: React.FC<DataInputProps> = ({ onDataParsed, points }) => {
  const [inputText, setInputText] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [appendMode, setAppendMode] = useState(true);

  const extractCoordsFromUrl = (url: string): { lat: number, lng: number } | null => {
    try {
      const qMatch = url.match(/q=([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
      if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

      const atMatch = url.match(/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/);
      if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

      return null;
    } catch (e) {
      return null;
    }
  };

  const handleParse = () => {
    const lines = inputText.trim().split('\n');
    const parsedPoints: CustomerPoint[] = [];

    lines.forEach((line, index) => {
      if (!line.trim()) return;

      // แยกข้อมูลด้วย Tab (Sheet) หรือ Comma (CSV)
      let parts = line.split('\t');
      if (parts.length <= 1) parts = line.split(',');
      
      // ลบช่องว่างและกรองข้อมูลเปล่าทิ้ง (บางที copy มามีช่องว่างเยอะ)
      // แต่ต้องระวังไม่ filter จน index เพี้ยนถ้า copy มาแบบ full row
      parts = parts.map(p => p.trim());

      let lat: number | null = null;
      let lng: number | null = null;
      let name = `Customer ${index + 1}`;

      // 1. หาตำแหน่งของ Link Map
      const mapLinkIndex = parts.findIndex(p => p.includes('google.com/maps') || p.includes('maps.app.goo.gl'));

      if (mapLinkIndex !== -1) {
        const coords = extractCoordsFromUrl(parts[mapLinkIndex]);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;

          // 2. Logic การหาชื่อ (Name Detection Heuristic)
          
          if (parts.length > 6) {
             // Case A: Copy มาทั้งบรรทัด (Full Row)
             // โครงสร้าง: Date, Time, ID, Name(Col D), ...
             // Name มักจะอยู่ที่ index 3
             if (parts[3]) name = parts[3];
          } else if (parts.length === 2) {
             // Case B: Copy มาแค่ 2 ช่อง (ชื่อ กับ ลิงก์)
             // ชื่อคือช่องที่ไม่ใช่ลิงก์
             name = parts[mapLinkIndex === 0 ? 1 : 0];
          } else if (parts.length >= 3 && parts.length <= 6) {
             // Case C: Copy แบบช่วง (Range) เช่น ลากจาก ชื่อ(D) ถึง ลิงก์(H)
             // ช่องแรกมักจะเป็นชื่อ
             name = parts[0];
          }
        }
      } else {
        // Fallback: รองรับ CSV แบบเก่า (Lat, Lng)
        if (parts.length >= 2) {
           const tryLat = parseFloat(parts[0]);
           const tryLng = parseFloat(parts[1]);
           if (!isNaN(tryLat) && !isNaN(tryLng)) {
              lat = tryLat;
              lng = tryLng;
              if (parts[2]) name = parts[2];
           }
        }
      }

      if (lat !== null && lng !== null) {
        parsedPoints.push({
          id: `p-${Date.now()}-${index}`,
          name,
          lat,
          lng,
        });
      }
    });

    if (parsedPoints.length > 0) {
      onDataParsed(parsedPoints, appendMode);
      setInputText('');
      setIsOpen(false);
    } else {
      alert('ไม่พบข้อมูลพิกัดแผนที่ที่ถูกต้อง\nกรุณาตรวจสอบว่า Copy ลิงก์ Google Maps มาด้วยหรือไม่');
    }
  };

  const handleExport = () => {
    if (points.length === 0) {
      alert("ไม่มีข้อมูลให้ดาวน์โหลด");
      return;
    }
    const headers = ["Name", "Latitude", "Longitude", "Google Maps Link"];
    const rows = points.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      p.lat,
      p.lng,
      `"https://www.google.com/maps?q=${p.lat},${p.lng}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `customer_locations_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadSample = () => {
    setInputText(SAMPLE_DATA);
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-[1000] bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg flex items-center gap-2 transition-all"
      >
        <Table className="w-6 h-6" />
        <span className="font-medium">นำเข้าข้อมูลลูกค้า ({points.length})</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800">นำเข้าข้อมูลลูกค้า</h2>
            <p className="text-sm text-gray-500 mt-1">Copy ชื่อและลิงก์แผนที่จาก Sheet มาวางได้เลย</p>
          </div>
          <button 
            onClick={() => setIsOpen(false)} 
            className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-full transition-all"
            title="ปิดหน้าต่าง"
          >
            <X className="w-8 h-8 text-red-500" strokeWidth={3} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {/* Export Section */}
          <div className="mb-6 flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
             <div className="flex items-center gap-3">
              <div className="bg-white p-2 rounded-lg border border-slate-100 text-slate-600">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">มีข้อมูลอยู่: {points.length} หมุด</p>
                <p className="text-xs text-slate-500">บันทึกอัตโนมัติ</p>
              </div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => onDataParsed([], false)} className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-red-100 flex items-center gap-1">
                <Trash2 className="w-4 h-4" /> ล้าง
              </button>
              <button onClick={handleExport} disabled={points.length === 0} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors border ${points.length === 0 ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>
          </div>

          <div className="mb-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-3">
              <HelpCircle className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-indigo-900 font-bold mb-1">ขั้นตอนง่ายๆ:</p>
                <ol className="text-sm text-indigo-800 list-decimal pl-4 space-y-1">
                  <li>กดปุ่มขวานี้เพื่อเปิด Google Sheet</li>
                  <li>Copy <strong>ชื่อ</strong> และ <strong>ลิงก์แผนที่</strong> (หรือลากคลุมทั้งแถวก็ได้)</li>
                  <li>นำมาวางในช่องว่างด้านล่าง</li>
                </ol>
              </div>
            </div>
            <a 
              href={USER_SHEET_URL} 
              target="_blank" 
              rel="noreferrer"
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow-sm transition-all text-sm"
            >
              <ExternalLink className="w-4 h-4" />
              เปิด Google Sheet ของฉัน
            </a>
          </div>

          <textarea
            className="w-full h-48 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono text-sm whitespace-pre"
            placeholder="วางข้อมูลที่นี่... (เช่น: คุณสมชาย ... https://maps.google.com/...)"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <div className="flex flex-col sm:flex-row gap-4 mt-4 justify-between items-center">
             <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 w-full sm:w-auto hover:bg-gray-100 transition-colors">
              <input 
                type="checkbox" 
                checked={appendMode} 
                onChange={(e) => setAppendMode(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              เพิ่มต่อจากข้อมูลเดิม (ไม่ลบทับ)
            </label>

            <div className="flex gap-3 w-full sm:w-auto justify-end">
              <button onClick={loadSample} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors">
                ตัวอย่าง
              </button>
              <button onClick={handleParse} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                <Plus className="w-5 h-5" />
                {appendMode ? 'เพิ่มหมุด' : 'สร้างใหม่'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};