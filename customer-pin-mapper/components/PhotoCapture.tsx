import React, { useRef, useState } from 'react';
import { Camera, X, Check, RotateCcw } from 'lucide-react';
import { CustomerPoint } from '../types';

interface PhotoCaptureProps {
  point: CustomerPoint;
  onConfirm: (photoDataUrl: string) => void;
  onCancel: () => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ point, onConfirm, onCancel }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Logic เพื่อเพิ่มความสุภาพ (เติม "คุณ" ถ้ายังไม่มี และไม่ใช่ร้านค้า)
  const noPrefixNeeded = /^(ร้าน|บริษัท|หจก|โรงเรียน|วัด|ธนาคาร|คุณ|Mr\.|Ms\.|Mrs\.)/.test(point.name);
  const displayName = noPrefixNeeded ? point.name : `คุณ${point.name}`;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      processImage(file);
    }
  };

  // ลดขนาดรูปภาพก่อนบันทึกเพื่อประหยัดพื้นที่และให้ทำงานเร็ว
  const processImage = (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // จำกัดความกว้างไม่เกิน 800px
        const scaleSize = MAX_WIDTH / img.width;
        
        // ถ้าปกติน้อยกว่า 800 ก็ไม่ต้องย่อมาก
        const targetWidth = img.width > MAX_WIDTH ? MAX_WIDTH : img.width;
        const targetHeight = img.width > MAX_WIDTH ? img.height * scaleSize : img.height;

        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Compress JPEG quality 0.7
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        setPreviewUrl(compressedBase64);
        setIsProcessing(false);
      };
    };
  };

  return (
    <div className="fixed inset-0 z-[2500] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-4 bg-slate-100 border-b flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg text-slate-800">ส่งงาน: {displayName}</h3>
            <p className="text-xs text-slate-500">ถ่ายรูปสินค้าหรือหน้าร้านเพื่อยืนยัน</p>
          </div>
          <button onClick={onCancel} className="p-2 bg-white rounded-full text-slate-500 hover:text-red-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-4 flex flex-col items-center justify-center bg-slate-50 relative min-h-[300px]">
          {isProcessing ? (
             <div className="text-blue-600 font-bold animate-pulse">กำลังประมวลผลรูปภาพ...</div>
          ) : previewUrl ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black rounded-lg overflow-hidden border border-slate-200">
              <img src={previewUrl} alt="Preview" className="max-w-full max-h-[50vh] object-contain" />
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-full border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-slate-100 transition-colors min-h-[250px]"
            >
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                <Camera className="w-10 h-10" />
              </div>
              <span className="text-slate-500 font-medium">แตะเพื่อถ่ายรูป</span>
            </div>
          )}
          
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" // บังคับเปิดกล้องบนมือถือ
            ref={fileInputRef}
            className="hidden" 
            onChange={handleFileChange}
          />
        </div>

        <div className="p-4 bg-white border-t flex gap-3">
          {previewUrl ? (
            <>
              <button 
                onClick={() => {
                  setPreviewUrl(null);
                  fileInputRef.current?.click();
                }}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200"
              >
                <RotateCcw className="w-5 h-5" /> ถ่ายใหม่
              </button>
              <button 
                onClick={() => onConfirm(previewUrl)}
                className="flex-[2] py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-2 hover:bg-green-700"
              >
                <Check className="w-5 h-5" /> ยืนยันส่งงาน
              </button>
            </>
          ) : (
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 hover:bg-blue-700"
            >
              <Camera className="w-5 h-5" /> เปิดกล้อง
            </button>
          )}
        </div>
      </div>
    </div>
  );
};