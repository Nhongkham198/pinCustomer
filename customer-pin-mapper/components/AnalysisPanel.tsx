import React, { useState } from 'react';
import { CustomerPoint } from '../types';
import { analyzeDeliveryZones } from '../services/geminiService';
import { BrainCircuit, Loader2, MapPin, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown'; // Assuming we'd usually use this, but for zero-dep simplicity I'll format text simply.

interface AnalysisPanelProps {
  points: CustomerPoint[];
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ points }) => {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleAnalyze = async () => {
    if (points.length === 0) return;
    setIsOpen(true);
    setLoading(true);
    try {
      const text = await analyzeDeliveryZones(points);
      setResult(text);
    } catch (e) {
      setResult("เกิดข้อผิดพลาดในการวิเคราะห์");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed top-6 right-6 z-[1000]">
        <button
          onClick={handleAnalyze}
          disabled={loading || points.length === 0}
          className={`flex items-center gap-2 px-6 py-3 rounded-full shadow-lg font-bold text-white transition-all transform hover:scale-105 ${
            points.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:shadow-indigo-500/50'
          }`}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <BrainCircuit className="w-5 h-5" />}
          {loading ? 'กำลังวิเคราะห์...' : 'วิเคราะห์เส้นทางด้วย AI'}
        </button>
      </div>

      {isOpen && result && (
        <div className="fixed inset-y-0 right-0 z-[1001] w-full md:w-[450px] bg-white shadow-2xl transform transition-transform duration-300 ease-in-out border-l border-gray-100 flex flex-col">
          <div className="p-6 bg-indigo-600 text-white flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <BrainCircuit className="w-6 h-6" />
                ผลการวิเคราะห์จาก Gemini
              </h2>
              <p className="text-indigo-100 text-sm mt-1">
                วิเคราะห์จากข้อมูลลูกค้า {points.length} ราย
              </p>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-indigo-200 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            <div className="prose prose-sm prose-indigo max-w-none">
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed font-sans">
                {result}
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t bg-white">
            <button 
              onClick={() => setIsOpen(false)}
              className="w-full py-2 text-center text-gray-500 hover:bg-gray-100 rounded-lg transition-colors text-sm"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </>
  );
};
