import React, { useState, useEffect, useRef } from 'react';
import { MapViewer } from './components/MapViewer';
import { DataInput } from './components/DataInput';
import { Header } from './components/Header';
import { Toast, ToastType } from './components/Toast';
import { PhotoCapture } from './components/PhotoCapture';
import { HistoryViewer } from './components/HistoryViewer';
import { CustomerPoint, MapViewerHandle, DeliveryRecord } from './types';
import { Navigation, Store, List, Loader2, History } from 'lucide-react';

const App: React.FC = () => {
  // 1. Initialize Points
  const [points, setPoints] = useState<CustomerPoint[]>(() => {
    try {
      const saved = localStorage.getItem('customerPoints');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // 2. Initialize History
  const [history, setHistory] = useState<DeliveryRecord[]>(() => {
    try {
      const saved = localStorage.getItem('deliveryHistory');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  const [isDataInputOpen, setIsDataInputOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [toast, setToast] = useState<{message: string, type: ToastType} | null>(null);
  
  // State for Job Completion
  const [finishingPoint, setFinishingPoint] = useState<CustomerPoint | null>(null);

  const mapRef = useRef<MapViewerHandle>(null);

  // Auto-save
  useEffect(() => {
    localStorage.setItem('customerPoints', JSON.stringify(points));
  }, [points]);

  useEffect(() => {
    localStorage.setItem('deliveryHistory', JSON.stringify(history));
  }, [history]);

  // Handlers
  const handleShowToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  const handleDataParsed = (newPoints: CustomerPoint[], append: boolean) => {
    if (newPoints.length === 0 && !append) {
      if (window.confirm("คุณต้องการลบข้อมูลหมุดทั้งหมดใช่หรือไม่?")) {
        setPoints([]);
        handleShowToast("ลบข้อมูลทั้งหมดเรียบร้อยแล้ว", "info");
      }
      return;
    }
    if (append) {
      setPoints((prev: CustomerPoint[]) => [...prev, ...newPoints]);
      handleShowToast(`เพิ่มลูกค้าใหม่ ${newPoints.length} รายเรียบร้อย`, "success");
    } else {
      setPoints(newPoints);
      handleShowToast(`นำเข้าข้อมูลลูกค้า ${newPoints.length} รายเรียบร้อย`, "success");
    }
  };

  const handleDeletePoint = (id: string) => {
    setPoints((prev: CustomerPoint[]) => prev.filter((p: CustomerPoint) => p.id !== id));
    handleShowToast("ลบหมุดเรียบร้อย", "info");
  };

  // Triggered when user clicks "Finish Job" in Map Popup
  const handleStartFinishJob = (point: CustomerPoint) => {
    setFinishingPoint(point);
  };

  // Function to update Google Sheet Status via Web App
  const updateGoogleSheetStatus = async (customerName: string) => {
    const scriptUrl = localStorage.getItem('googleScriptUrl');
    if (!scriptUrl) return; // ถ้าไม่ได้ตั้งค่าไว้ ก็ข้ามไป

    try {
      handleShowToast("กำลังอัปเดตสถานะใน Google Sheet...", "info");
      
      // Send POST request to Google Apps Script
      // Note: 'no-cors' is required for simple requests to GAS from browser, 
      // response will be opaque but action will trigger.
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors', 
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: customerName,
          status: 'DELIVERED',
          timestamp: new Date().toLocaleString('th-TH')
        })
      });
      
      // เนื่องจาก no-cors เราเช็ค response.ok ไม่ได้ แต่ถ้าไม่มี error ก็ถือว่าส่งออกไปแล้ว
      console.log(`Sent update for ${customerName} to Google Sheet`);
      
    } catch (error) {
      console.error("Failed to update Google Sheet:", error);
      handleShowToast("ไม่สามารถอัปเดต Google Sheet ได้", "error");
    }
  };

  // Triggered when photo is captured and confirmed
  const handleConfirmFinishJob = (photoDataUrl: string) => {
    if (!finishingPoint) return;

    // 1. Update Google Sheet (Fire and forget)
    updateGoogleSheetStatus(finishingPoint.name);

    const record: DeliveryRecord = {
      id: `history-${Date.now()}`,
      customerName: finishingPoint.name,
      timestamp: new Date().toISOString(),
      photoUrl: photoDataUrl,
      location: { lat: finishingPoint.lat, lng: finishingPoint.lng }
    };

    // Save to history
    setHistory((prev: DeliveryRecord[]) => [...prev, record]);
    
    // Remove from active points
    setPoints((prev: CustomerPoint[]) => prev.filter((p: CustomerPoint) => p.id !== finishingPoint.id));

    setFinishingPoint(null);
    handleShowToast("🎉 ส่งงานสำเร็จ! บันทึกรูปภาพแล้ว", "success");
  };

  const toggleTracking = () => {
    if (mapRef.current) mapRef.current.toggleTracking();
  };

  const resetToShop = () => {
    if (mapRef.current) mapRef.current.resetToShop();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-100 flex flex-col">
      
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <Header />

      <div className="flex-1 w-full relative pb-20">
         <MapViewer 
            ref={mapRef} 
            points={points} 
            onDeletePoint={handleDeletePoint} 
            onFinishJob={handleStartFinishJob}
            onTrackingChange={setIsTracking}
            onShowToast={handleShowToast}
         />
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.1)] border-t border-slate-100 z-[1100] px-4 py-3 pb-6 flex items-center justify-between gap-3">
        <button
          onClick={() => setIsDataInputOpen(true)}
          className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-500 hover:bg-slate-50 active:scale-95 transition-all w-20"
        >
          <div className="bg-slate-100 p-2 rounded-full mb-1 relative">
            <List className="w-6 h-6 text-slate-600" />
            <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
              {points.length}
            </div>
          </div>
          <span className="text-[10px] font-bold">รายชื่อ</span>
        </button>

        <button
          onClick={toggleTracking}
          className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl shadow-lg transition-all transform active:scale-95 font-bold text-lg ${
            isTracking 
            ? 'bg-red-500 text-white ring-4 ring-red-100 animate-pulse' 
            : 'bg-blue-600 text-white ring-4 ring-blue-100'
          }`}
        >
           {isTracking ? (
             <>
               <Loader2 className="w-6 h-6 animate-spin" />
               <span>หยุดนำทาง</span>
             </>
           ) : (
             <>
               <Navigation className="w-6 h-6 fill-current" />
               <span>เริ่มนำทาง</span>
             </>
           )}
        </button>

        <button
          onClick={() => setIsHistoryOpen(true)}
          className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-500 hover:bg-slate-50 active:scale-95 transition-all w-20"
        >
          <div className="bg-emerald-100 p-2 rounded-full mb-1">
            <History className="w-6 h-6 text-emerald-600" />
          </div>
          <span className="text-[10px] font-bold text-emerald-800">ประวัติ</span>
        </button>
      </div>

      {/* Modals */}
      <DataInput 
        onDataParsed={handleDataParsed} 
        points={points} 
        isOpen={isDataInputOpen}
        onClose={() => setIsDataInputOpen(false)}
      />

      {isHistoryOpen && (
        <HistoryViewer 
          history={history} 
          onClearHistory={() => setHistory([])}
          onClose={() => setIsHistoryOpen(false)} 
        />
      )}

      {finishingPoint && (
        <PhotoCapture 
          point={finishingPoint} 
          onConfirm={handleConfirmFinishJob} 
          onCancel={() => setFinishingPoint(null)} 
        />
      )}

      {/* Quick Return Button (Floating) - Moved higher to bottom-36 */}
      <button
        onClick={resetToShop}
        className="fixed bottom-36 right-4 bg-white p-3 rounded-full shadow-lg border border-slate-200 text-orange-600 z-[1000] hover:bg-orange-50 active:scale-90 transition-all"
        title="กลับไปที่ร้าน"
      >
        <Store className="w-6 h-6" />
      </button>

    </div>
  );
};

export default App;