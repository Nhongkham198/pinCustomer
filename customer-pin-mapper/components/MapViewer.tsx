import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { CustomerPoint, MapViewerHandle } from '../types';

interface MapViewerProps {
  points: CustomerPoint[];
  onDeletePoint: (id: string) => void;
  onFinishJob: (point: CustomerPoint) => void; // New prop
  onTrackingChange?: (isTracking: boolean) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

declare global {
  interface Window {
    L: any;
  }
}

// พิกัดร้านของคุณ
const SHOP_LOCATION = { lat: 16.43624, lng: 103.5020 };
// Logo สำรอง (กรณีไม่ได้ตั้งค่าในเครื่อง)
const DEFAULT_LOGO = "https://i.postimg.cc/QMdZ76mG/Logo_Branch1.webp";

export const MapViewer = forwardRef<MapViewerHandle, MapViewerProps>(({ points, onDeletePoint, onFinishJob, onTrackingChange, onShowToast }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLayerRef = useRef<any>(null); 
  
  // State สำหรับ Tracking
  const [isTracking, setIsTracking] = useState(false);
  const userMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);

  // ฟังก์ชันขอ Wake Lock
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          console.error(`${err} - Wake Lock failed`);
        }
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.error('Failed to release Wake Lock', err);
      }
    }
  };

  const fetchWithRetry = async (url: string, retries = 3, delay = 1000): Promise<Response> => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Status: ${response.status}`);
      return response;
    } catch (error) {
      if (retries > 0) {
        console.log(`Retrying route fetch... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, retries - 1, delay);
      } else {
        throw error;
      }
    }
  };

  // ฟังก์ชันดึงเส้นทาง (อัปเดตเพื่อแก้ปัญหาบน PC)
  const drawRoute = async (destLat: number, destLng: number) => {
    if (!mapInstanceRef.current) return;
    const L = window.L;

    document.body.style.cursor = 'wait';
    onShowToast("กำลังคำนวณเส้นทาง...", "info");

    try {
      // 1. หาจุดเริ่มต้น
      let startLat = SHOP_LOCATION.lat;
      let startLng = SHOP_LOCATION.lng;
      let usingShopLocation = true;

      if (userMarkerRef.current) {
        // กรณีมี GPS (บนมือถือที่ Tracking อยู่)
        const latlng = userMarkerRef.current.getLatLng();
        startLat = latlng.lat;
        startLng = latlng.lng;
        usingShopLocation = false;
      } else if ('geolocation' in navigator && isTracking) {
        // กรณีเปิด Tracking แต่ Marker ยังไม่ขึ้น (รอ GPS)
        try {
           const position: any = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, enableHighAccuracy: false });
           });
           startLat = position.coords.latitude;
           startLng = position.coords.longitude;
           usingShopLocation = false;
        } catch (e) {
           console.log("GPS timeout, using shop");
        }
      } 
      // กรณี PC หรือไม่ได้ Tracking จะใช้ Shop Location ทันทีโดยไม่ต้องรอ Timeout

      if (usingShopLocation) {
         onShowToast("ใช้ตำแหน่งร้านเป็นจุดเริ่มต้น (ไม่พบ GPS)", "info");
      }

      // 2. เรียก API OSRM
      const response = await fetchWithRetry(
        `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`
      );

      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const routeGeoJSON = data.routes[0].geometry;

        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
        }

        routeLayerRef.current = L.geoJSON(routeGeoJSON, {
          style: {
            color: '#3b82f6',
            weight: 6,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: '1, 10', 
          }
        }).addTo(mapInstanceRef.current);

        setTimeout(() => {
           if(routeLayerRef.current) {
             routeLayerRef.current.setStyle({ dashArray: null });
           }
        }, 100);

        mapInstanceRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
        
      } else {
        throw new Error("No route found");
      }
    } catch (error) {
      console.error("Error fetching route:", error);
      onShowToast("⚠️ เน็ตไม่เสถียร ไม่สามารถวาดเส้นทางได้\nกรุณาใช้ปุ่ม 'เปิด Google Maps' ด้านล่างแทน", "error");
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  useImperativeHandle(ref, () => ({
    toggleTracking: () => {
      if (isTracking) {
        // Stop logic
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
        if (userMarkerRef.current) {
          userMarkerRef.current.remove();
          userMarkerRef.current = null;
        }
        releaseWakeLock();
        setIsTracking(false);
        if (onTrackingChange) onTrackingChange(false);
        onShowToast("หยุดการติดตามตำแหน่งแล้ว", "info");
      } else {
        // Start logic
        if (!('geolocation' in navigator)) {
          onShowToast('อุปกรณ์ของคุณไม่รองรับ GPS', "error");
          return;
        }

        // แจ้งเตือนทันทีว่ากำลังค้นหา (เพื่อให้ผู้ใช้รู้ว่ากดติดแล้ว)
        onShowToast("กำลังค้นหาสัญญาณดาวเทียม... 🛰️", "info");

        requestWakeLock();
        setIsTracking(true);
        if (onTrackingChange) onTrackingChange(true);

        const L = window.L;
        const userIcon = L.divIcon({
          className: 'user-location-icon',
          html: `<div style="background-color:#2563eb;width:44px;height:44px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.2),0 8px 15px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
          </div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          popupAnchor: [0, -22]
        });

        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            if (!mapInstanceRef.current) return;

            if (!userMarkerRef.current) {
              // First fix success
              onShowToast(`จับสัญญาณ GPS ได้แล้ว (ความแม่นยำ ${Math.round(accuracy)} ม.)`, "success");

              userMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon, zIndexOffset: 1000 }).addTo(mapInstanceRef.current)
                .bindPopup("🚗 รถส่งของ (คุณอยู่ที่นี่)", { autoPan: false });
               mapInstanceRef.current.setView([latitude, longitude], 17, { animate: true });
            } else {
              userMarkerRef.current.setLatLng([latitude, longitude]);
              // Pan smoothly
              mapInstanceRef.current.panTo([latitude, longitude], { animate: true, duration: 0.5 });
            }
          },
          (error) => {
            console.warn("GPS Signal lost/error:", error);
            
            let msg = "ระบบ GPS ขัดข้อง";
            let type: 'error' | 'info' = 'error';

            if (error.code === 1) { // PERMISSION_DENIED
               msg = "❌ ถูกปิดกั้นการเข้าถึงตำแหน่ง\n(กรุณาไปที่ ตั้งค่า -> แอป -> อนุญาต Location)";
               
               // Critical error: must stop tracking
               if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
               watchIdRef.current = null;
               setIsTracking(false);
               if (onTrackingChange) onTrackingChange(false);
               releaseWakeLock();
            } else if (error.code === 2) { // POSITION_UNAVAILABLE
               msg = "⚠️ หาสัญญาณ GPS ไม่เจอ\n(ลองออกไปที่โล่ง หรือเปิด Google Maps เช็ค)";
            } else if (error.code === 3) { // TIMEOUT
               msg = "⚠️ ค้นหาสัญญาณนานเกินไป (สัญญาณอ่อน)";
            }
            
            onShowToast(msg, type);
          },
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 } // เพิ่มเวลา Timeout เป็น 30 วิ
        );
      }
    },
    resetToShop: () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([SHOP_LOCATION.lat, SHOP_LOCATION.lng], 16, { animate: true });
        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
          routeLayerRef.current = null;
        }
      }
    }
  }));

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTracking) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      releaseWakeLock();
    };
  }, [isTracking]);

  // Main Map Logic
  useEffect(() => {
    if (!mapContainerRef.current || !window.L) return;
    const L = window.L;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, { zoomControl: false }).setView([SHOP_LOCATION.lat, SHOP_LOCATION.lng], 13);
      L.control.zoom({ position: 'topleft' }).addTo(mapInstanceRef.current);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(mapInstanceRef.current);

      const savedLogo = localStorage.getItem('seoulgood_logo');
      const displayLogo = savedLogo || DEFAULT_LOGO;
      const shopIcon = L.divIcon({
        className: 'custom-shop-icon',
        html: `<div style="background-color: white; width: 56px; height: 56px; border-radius: 50%; border: 4px solid white; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); overflow: hidden; position: relative;"><img src="${displayLogo}" style="width: 100%; height: 100%; object-fit: cover;" alt="Shop"></div>`,
        iconSize: [56, 56],
        iconAnchor: [28, 28],
        popupAnchor: [0, -28]
      });

      L.marker([SHOP_LOCATION.lat, SHOP_LOCATION.lng], { icon: shopIcon }).addTo(mapInstanceRef.current)
        .bindPopup(`<div class="text-center font-sans px-1 pb-1"><div class="w-20 h-20 mx-auto mb-1 flex items-center justify-center"><img src="${displayLogo}" class="w-full h-full object-contain drop-shadow-sm" alt="Shop Logo"></div><h3 class="font-bold text-base text-slate-800 mb-0 leading-tight">SeoulGood Route</h3><p class="text-xs text-gray-500 mt-1 mb-0">จุดเริ่มต้นส่งสินค้า</p></div>`, { minWidth: 160, maxWidth: 200, closeButton: true, autoPan: true });
      
      setTimeout(() => { mapInstanceRef.current.invalidateSize(); }, 200);
    }

    const map = mapInstanceRef.current;
    
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const bounds = L.latLngBounds();
    bounds.extend([SHOP_LOCATION.lat, SHOP_LOCATION.lng]);

    if (points.length > 0) {
      points.forEach(point => {
        const popupContent = document.createElement('div');
        popupContent.className = "text-center font-sans p-3 min-w-[350px]";
        
        popupContent.innerHTML = `
          <h3 class="font-extrabold text-2xl text-slate-900 mb-1 leading-tight tracking-tight mt-1">${point.name}</h3>
          <p class="text-sm text-gray-400 mb-4 font-mono">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</p>
          
          <div class="flex flex-col gap-2">
            <button class="btn-in-app-route block w-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mb-1">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
               นำทาง (ในแอปนี้)
            </button>
            
            <!-- ปุ่ม Finish Job -->
            <button class="btn-finish-job block w-full bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mb-1">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
               ✅ ส่งสำเร็จ (ถ่ายรูป)
            </button>

            <a href="https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}" target="_blank" class="block w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-bold py-2 px-4 rounded-xl transition-all no-underline flex items-center justify-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l5 5-5 5"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>
               เปิด Google Maps (สำรอง)
            </a>
            
            <button class="btn-delete block w-full text-red-300 hover:text-red-500 text-xs font-bold py-2 px-4 mt-2">
               ลบหมุดนี้ (Admin)
            </button>
          </div>
        `;

        const routeBtn = popupContent.querySelector('.btn-in-app-route');
        if (routeBtn) {
          routeBtn.addEventListener('click', () => {
            drawRoute(point.lat, point.lng);
            map.closePopup();
          });
        }

        // New Finish Button Listener
        const finishBtn = popupContent.querySelector('.btn-finish-job');
        if (finishBtn) {
          finishBtn.addEventListener('click', () => {
            onFinishJob(point);
            map.closePopup();
          });
        }

        const deleteBtn = popupContent.querySelector('.btn-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', () => {
             const password = prompt(`ต้องการลบหมุด "${point.name}" ใช่ไหม?\nกรุณาใส่รหัสผ่านเพื่อยืนยัน:`);
             if (password === '198') {
               onDeletePoint(point.id);
             } else if (password !== null) {
               onShowToast('รหัสผ่านไม่ถูกต้อง!', "error");
             }
          });
        }

        const marker = L.marker([point.lat, point.lng]).addTo(map).bindPopup(popupContent, { maxWidth: 500, minWidth: 350 }); 
        markersRef.current.push(marker);
        bounds.extend([point.lat, point.lng]);
      });
    }

  }, [points, onDeletePoint, onFinishJob, onShowToast]);

  return <div className="relative w-full h-full"><div ref={mapContainerRef} className="w-full h-full z-0" /></div>;
});

MapViewer.displayName = 'MapViewer';