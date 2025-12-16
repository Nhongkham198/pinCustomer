import React, { useState } from 'react';
import { DeliveryRecord } from '../types';
import { Clock, MapPin, Trash2, X, CheckSquare, Square } from 'lucide-react';

interface HistoryViewerProps {
  history: DeliveryRecord[];
  onDeleteHistory: (ids: string[]) => void;
  onClose: () => void;
}

export const HistoryViewer: React.FC<HistoryViewerProps> = ({ history, onDeleteHistory, onClose }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Toggle การเลือกรายการเดียว
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // เลือกทั้งหมด / ยกเลิกทั้งหมด
  const toggleSelectAll = () => {
    if (selectedIds.size === history.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(history.map(h => h.id)));
    }
  };

  // ลบรายการที่เลือก
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    
    const password = prompt(`ต้องการลบ ${selectedIds.size} รายการที่เลือก?\nกรุณาใส่รหัสผ่านเพื่อยืนยัน:`);
    if (password === '198') {
        onDeleteHistory(Array.from(selectedIds));
        setSelectedIds(new Set());
    } else if (password !== null) {
        alert("รหัสผ่านไม่ถูกต้อง");
    }
  };

  // ลบรายตัว (กดที่ถังขยะเล็ก)
  const handleDeleteSingle = (id: string) => {
     const password = prompt("ต้องการลบรายการนี้?\nกรุณาใส่รหัสผ่านเพื่อยืนยัน:");
     if (password === '198') {
        onDeleteHistory([id]);
     } else if (password !== null) {
        alert("รหัสผ่านไม่ถูกต้อง");
     }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">ประวัติการส่งงาน</h2>
            <p className="text-sm text-slate-500">ทั้งหมด {history.length} รายการ</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar Selection */}
        {history.length > 0 && (
            <div className="px-4 py-2 bg-white border-b border-gray-100 flex items-center justify-between">
                <button 
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 font-medium"
                >
                    {selectedIds.size === history.length && history.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : (
                        <Square className="w-5 h-5 text-slate-400" />
                    )}
                    เลือกทั้งหมด
                </button>
                
                {selectedIds.size > 0 && (
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                        เลือกอยู่ {selectedIds.size} รายการ
                    </span>
                )}
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 bg-slate-100">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-10">
              <Clock className="w-16 h-16 mb-4 opacity-20" />
              <p>ยังไม่มีประวัติการส่งงาน</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {history.slice().reverse().map((record) => {
                const isSelected = selectedIds.has(record.id);
                return (
                    <div 
                        key={record.id} 
                        className={`relative bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col transition-all ${isSelected ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-200'}`}
                    >
                        {/* Checkbox Overlay */}
                        <div 
                            onClick={() => toggleSelection(record.id)}
                            className="absolute top-2 left-2 z-10 cursor-pointer"
                        >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shadow-md transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'bg-white text-gray-300 hover:text-gray-400'}`}>
                                {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </div>
                        </div>

                        {/* Delete Single Button */}
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSingle(record.id);
                            }}
                            className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full shadow-sm transition-colors"
                            title="ลบรายการนี้"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="relative h-48 bg-slate-200" onClick={() => toggleSelection(record.id)}>
                            <img src={record.photoUrl} alt="Proof" className="w-full h-full object-cover" />
                            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
                                <p className="text-white font-bold text-lg leading-none">{record.customerName}</p>
                            </div>
                        </div>
                        <div className="p-3 bg-white cursor-pointer" onClick={() => toggleSelection(record.id)}>
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
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 bg-white border-t flex justify-between items-center gap-3">
            {selectedIds.size > 0 ? (
                 <button 
                    onClick={handleDeleteSelected}
                    className="flex-1 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 flex items-center justify-center gap-2 transition-all"
                >
                    <Trash2 className="w-4 h-4" /> 
                    ลบ {selectedIds.size} รายการที่เลือก
                </button>
            ) : (
                <div className="flex-1 text-xs text-gray-400 text-center">
                    แตะที่กล่องเพื่อเลือกรายการที่ต้องการลบ
                </div>
            )}
           
            <button onClick={onClose} className="px-6 py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">
              ปิด
            </button>
        </div>
      </div>
    </div>
  );
};