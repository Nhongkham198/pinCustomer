import React from 'react';
import { DeliveryRecord } from '../types';
import { Clock, MapPin, Trash2, X, Lock } from 'lucide-react';

interface HistoryViewerProps {
  history: DeliveryRecord[];
  onClearHistory: () => void;
  onClose: () => void;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({ history, onClearHistory, onClose }) => {
  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">ประวัติการส่งงาน</h2>
            <p className="text-sm text-slate-500">รายการที่ส่งสำเร็จแล้ว ({history.length})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
              <Clock className="w-16 h-16 mb-4 opacity-20" />
              <p>ยังไม่มีประวัติการส่งงาน</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {history.slice().reverse().map((record) => (
                <div key={record.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="relative h-48 bg-slate-200">
                    <img src={record.photoUrl} alt="Proof" className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
                       <p className="text-white font-bold text-lg leading-none">{record.customerName}</p>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <Clock className="w-3 h-3" />
                      {new Date(record.timestamp).toLocaleString('th-TH')}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <MapPin className="w-3 h-3" />
                      {record.location.lat.toFixed(5)}, {record.location.lng.toFixed(5)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t flex justify-between items-center">
            <button 
              onClick={() => {
                const password = prompt("ต้องการล้างประวัติทั้งหมด?\nกรุณาใส่รหัสผ่านเจ้าของร้านเพื่อยืนยัน:");
                if (password === '198') {
                   onClearHistory();
                } else if (password !== null) {
                   alert("รหัสผ่านไม่ถูกต้อง! ไม่สามารถล้างประวัติได้");
                }
              }}
              disabled={history.length === 0}
              className="text-red-500 text-sm font-bold flex items-center gap-2 px-4 py-2 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> ล้างประวัติ (Admin)
            </button>
            <button onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200">
              ปิด
            </button>
        </div>
      </div>
    </div>
  );
};