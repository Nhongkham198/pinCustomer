import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { CustomerPoint, MapViewerHandle } from '../types';

interface MapViewerProps {
  points: CustomerPoint[];
  onDeletePoint: (id: string) => void;
  onFinishJob: (point: CustomerPoint) => void;
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
// Logo สำรอง
const DEFAULT_LOGO = "https://i.postimg.cc/QMdZ76mG/Logo_Branch1.webp";

export const MapViewer = forwardRef<MapViewerHandle, MapViewerProps>(({ points, onDeletePoint, onFinishJob, onTrackingChange, onShowToast }, ref) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const routeLayerRef = useRef<any>(null); 
  
  // State สำหรับ Tracking
  const [isTracking, setIsTracking] = useState(false);
  const userMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null); // วงกลมแสดงความแม่นยำ
  const watchIdRef = useRef<number | null>(null);
  const fallbackTimeoutRef = useRef<any>(null); // Manual timeout สำหรับ iOS
  const wakeLockRef = useRef<any>(null);

  // ฟังก์ชันขอ Wake Lock (ป้องกันหน้าจอดับ)
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err: any) {
        // Android บางรุ่นอาจไม่รองรับ หรือ User ไม่ให้สิทธิ์ ก็ปล่อยผ่าน
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.log('Failed to release Wake Lock', err);
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
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, retries - 1, delay);
      } else {
        throw error;
      }
    }
  };

  // Helper: สร้าง/อัปเดตหมุดตำแหน่งผู้ใช้
  const updateUserMarker = (lat: number, lng: number, accuracy: number) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;

    // 1. สร้าง Icon (ถ้ายังไม่มี)
    if (!userMarkerRef.current) {
       const userIcon = L.divIcon({
          className: 'user-location-icon',
          html: `<div style="background-color:#2563eb;width:44px;height:44px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(37,99,235,0.2),0 8px 15px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
          </div>`,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          popupAnchor: [0, -22]
        });

        // สร้าง Marker
        userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 9999 })
          .addTo(mapInstanceRef.current)
          .bindPopup(`🚗 รถส่งของ (ความแม่นยำ ${Math.round(accuracy)} ม.)`, { autoPan: false });

        // สร้าง Circle (วงแสดงรัศมี Accuracy)
        accuracyCircleRef.current = L.circle([lat, lng], { radius: accuracy, color: '#2563eb', fillOpacity: 0.1, weight: 1 })
          .addTo(mapInstanceRef.current);

        // Pan ไปหาทันทีในครั้งแรก
        mapInstanceRef.current.setView([lat, lng], 17, { animate: true });
        onShowToast(`พบตำแหน่งแล้ว! (แม่นยำ ${Math.round(accuracy)} ม.)`, "success");

    } else {
        // อัปเดตตำแหน่งเดิม
        const newLatLng = new L.LatLng(lat, lng);
        userMarkerRef.current.setLatLng(newLatLng);
        userMarkerRef.current.setPopupContent(`🚗 รถส่งของ (ความแม่นยำ ${Math.round(accuracy)} ม.)`);
        
        if (accuracyCircleRef.current) {
            accuracyCircleRef.current.setLatLng(newLatLng);
            accuracyCircleRef.current.setRadius(accuracy);
        }

        // Pan ตามนุ่มๆ
        mapInstanceRef.current.panTo(newLatLng, { animate: true, duration: 0.5 });
    }
  };

  const drawRoute = async (destLat: number, destLng: number) => {
    if (!mapInstanceRef.current) return;
    const L = window.L;

    document.body.style.cursor = 'wait';
    onShowToast("กำลังคำนวณเส้นทาง...", "info");

    try {
      let startLat = SHOP_LOCATION.lat;
      let startLng = SHOP_LOCATION.lng;
      let usingShopLocation = true;

      // Logic การหาจุดเริ่ม: เอาจาก Marker ล่าสุดก่อน -> ถ้าไม่มีลองขอ GPS สด -> ถ้าไม่ได้ใช้ร้าน
      if (userMarkerRef.current) {
        const latlng = userMarkerRef.current.getLatLng();
        startLat = latlng.lat;
        startLng = latlng.lng;
        usingShopLocation = false;
      } else if ('geolocation' in navigator && isTracking) {
        try {
           const position: any = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, enableHighAccuracy: false });
           });
           startLat = position.coords.latitude;
           startLng = position.coords.longitude;
           usingShopLocation = false;
        } catch (e) {
           console.log("GPS route timeout, using shop");
        }
      } 

      if (usingShopLocation) {
         onShowToast("ใช้ตำแหน่งร้านเป็นจุดเริ่มต้น (ไม่พบ GPS)", "info");
      }

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
      onShowToast("⚠️ เน็ตไม่เสถียร ไม่สามารถวาดเส้นทางได้", "error");
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  const startWatchingPosition = (enableHighAccuracy: boolean) => {
    if (!('geolocation' in navigator) || !mapInstanceRef.current) return;
    
    // Clear old watcher
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    // Clear old timeout
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    const message = enableHighAccuracy 
      ? "กำลังค้นหา GPS (ดาวเทียม)..." 
      : "กำลังค้นหาตำแหน่ง (เสาสัญญาณ)...";
    onShowToast(message, "info");

    // 🛠️ iOS FIX: Manual Fallback Timeout
    // iOS มักจะไม่ throw error เมื่อหา GPS ไม่เจอในโหมด High Accuracy แต่จะเงียบไปเลย
    // เราจึงต้องจับเวลาเอง ถ้าผ่านไป 6 วินาทียังไม่ได้ตำแหน่ง ให้สลับไปโหมด Low Accuracy
    if (enableHighAccuracy) {
      fallbackTimeoutRef.current = setTimeout(() => {
        if (!userMarkerRef.current) {
          console.log("iOS Safety Net: High Accuracy timed out, switching to Low Accuracy");
          onShowToast("GPS ตอบสนองช้า สลับไปใช้สัญญาณมือถือแทน", "info");
          startWatchingPosition(false);
        }
      }, 6000); 
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // ถ้าได้ตำแหน่งแล้ว ให้ยกเลิก Timeout ทันที
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }

        const { latitude, longitude, accuracy } = position.coords;
        updateUserMarker(latitude, longitude, accuracy);
      },
      (error) => {
        console.warn("GPS Error:", error.code);
        
        // ยกเลิก Timeout เพราะ Error แล้ว
        if (fallbackTimeoutRef.current) {
          clearTimeout(fallbackTimeoutRef.current);
          fallbackTimeoutRef.current = null;
        }

        // Smart Fallback
        if (enableHighAccuracy) {
           console.log("High accuracy failed, switching to low accuracy...");
           startWatchingPosition(false); 
           return;
        }

        let msg = "ระบบ GPS ขัดข้อง";
        if (error.code === 1) {
           // iOS message specific
           msg = "❌ กรุณาเปิดสิทธิ์ระบุตำแหน่ง (Settings > Privacy > Location Services)";
           stopTrackingInternal();
        } else if (error.code === 2) {
           msg = "⚠️ ไม่พบสัญญาณ GPS";
        } else if (error.code === 3) {
           msg = "⚠️ สัญญาณ GPS อ่อนมาก";
        }
        
        if (error.code === 1) onShowToast(msg, "error");
      },
      { 
        enableHighAccuracy: enableHighAccuracy, 
        maximumAge: 0, // 🛠️ iOS Fix: Force fresh reading (ป้องกัน Cached เก่าค้าง)
        timeout: 10000 
      } 
    );
  };

  const stopTrackingInternal = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
      accuracyCircleRef.current = null;
    }
    releaseWakeLock();
    setIsTracking(false);
    if (onTrackingChange) onTrackingChange(false);
  };

  useImperativeHandle(ref, () => ({
    toggleTracking: () => {
      if (isTracking) {
        stopTrackingInternal();
        onShowToast("หยุดการติดตามตำแหน่งแล้ว", "info");
      } else {
        // 1. ตรวจสอบ HTTPS
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (window.location.protocol !== 'https:' && !isLocal) {
          alert('⚠️ iOS บังคับใช้ HTTPS สำหรับ GPS\nกรุณาเข้าเว็บผ่าน https:// เท่านั้น');
          onShowToast('ระบบต้องการ HTTPS', "error");
          return;
        }

        if (!('geolocation' in navigator)) {
          onShowToast('อุปกรณ์ของคุณไม่รองรับ GPS', "error");
          return;
        }

        setIsTracking(true);
        if (onTrackingChange) onTrackingChange(true);
        requestWakeLock();

        // 🚀 KICKSTART STRATEGY 🚀
        // ลองดึงค่าล่าสุดแบบเร็วๆ มาก่อน (Low Accuracy) เผื่อมี Cache
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                // ถ้ายังไม่มี Marker จาก Watcher ให้แสดงอันนี้ไปก่อน
                if (!userMarkerRef.current) {
                  updateUserMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                }
            },
            (err) => { /* Ignore errors from kickstart */ },
            { 
                enableHighAccuracy: false, 
                timeout: 3000, 
                maximumAge: Infinity 
            }
        );

        // เริ่มต้นด้วย High Accuracy (แต่มี Timeout Safety Net ดักไว้แล้วข้างใน)
        startWatchingPosition(true);
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
      stopTrackingInternal();
    };
  }, []); 

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