import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { CustomerPoint, MapViewerHandle } from '../types';
import { Navigation, Clock, Box, Layers } from 'lucide-react';

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
  const directionLinesRef = useRef<any[]>([]); // เก็บเส้นนำสายตา (เส้นสีส้ม)
  
  // State สำหรับ Tracking
  const [isTracking, setIsTracking] = useState(false);
  
  // State สำหรับโหมด 3D
  const [is3DMode, setIs3DMode] = useState(false);
  
  // State สำหรับข้อมูลเส้นทาง (ระยะทาง/เวลา)
  const [routeStats, setRouteStats] = useState<{ distance: string, duration: string } | null>(null);

  const userMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null); // วงกลมแสดงความแม่นยำ
  const watchIdRef = useRef<number | null>(null);
  const fallbackTimeoutRef = useRef<any>(null); // Manual timeout สำหรับ iOS
  const wakeLockRef = useRef<any>(null);
  
  // Ref สำหรับควบคุมการ Pan อัตโนมัติ (จะหยุดเมื่อ User เลื่อนแผนที่เอง)
  const shouldAutoPanRef = useRef(false);

  // Ref สำหรับระบบนำทางอัตโนมัติ (Rerouting)
  const activeDestinationRef = useRef<{lat: number, lng: number} | null>(null);
  const lastRouteCalcPosRef = useRef<{lat: number, lng: number} | null>(null);

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

  // Helper: คำนวณระยะทาง (Haversine Formula) เป็นเมตร
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // ฟังก์ชันวาดเส้น Radar หาลูกค้าที่ใกล้ที่สุด 5 คน
  const updateNearestLines = (userLat: number, userLng: number) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;

    // 1. ลบเส้นเก่าออกก่อน
    directionLinesRef.current.forEach(line => line.remove());
    directionLinesRef.current = [];

    if (points.length === 0) return;

    // 2. คำนวณระยะทางหาลูกค้าทุกเจ้า
    const candidates = points.map(p => ({
        ...p,
        distance: getDistanceMeters(userLat, userLng, p.lat, p.lng)
    }));

    // 3. เรียงลำดับจากใกล้ไปไกล และตัดมาแค่ 5 อันดับแรก
    const nearestPoints = candidates.sort((a, b) => a.distance - b.distance).slice(0, 5);

    // 4. วาดเส้น
    nearestPoints.forEach(p => {
        // วาดเส้นประสีส้มบางๆ
        const line = L.polyline([[userLat, userLng], [p.lat, p.lng]], {
            color: '#f97316', // สีส้ม (Orange-500)
            weight: 2,        // เส้นบาง
            dashArray: '5, 10', // เส้นประ
            opacity: 0.6,     // จางๆ หน่อยจะได้ไม่กวนตา
            interactive: false // ไม่ต้องคลิกได้
        }).addTo(mapInstanceRef.current);
        
        directionLinesRef.current.push(line);
    });
  };

  // Helper: สร้าง/อัปเดตหมุดตำแหน่งผู้ใช้
  const updateUserMarker = (lat: number, lng: number, accuracy: number, heading: number | null) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;

    // อัปเดตเส้น Radar หาลูกค้าใกล้เคียง
    updateNearestLines(lat, lng);

    // --- AUTO REROUTING LOGIC ---
    if (activeDestinationRef.current && lastRouteCalcPosRef.current) {
        const distFromLastCalc = getDistanceMeters(
            lat, lng, 
            lastRouteCalcPosRef.current.lat, lastRouteCalcPosRef.current.lng
        );

        if (distFromLastCalc > 40) { 
            console.log("User moved > 40m, recalculating route...");
            drawRoute(activeDestinationRef.current.lat, activeDestinationRef.current.lng, true); 
        }
    }
    // -----------------------------

    // 1. สร้าง Icon (ถ้ายังไม่มี)
    if (!userMarkerRef.current) {
       // สร้างลูกศรสีแดง (Navigation Arrow)
       const userIcon = L.divIcon({
          className: 'user-location-icon',
          html: `
            <div id="user-heading-arrow" style="transform: rotate(${heading || 0}deg); transition: transform 0.3s ease; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.3));">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; overflow: visible;">
                    <path d="M50 0 L100 100 L50 80 L0 100 Z" fill="#ef4444" stroke="white" stroke-width="6" stroke-linejoin="round" />
                </svg>
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -20]
        });

        // สร้าง Marker
        userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 9999 })
          .addTo(mapInstanceRef.current)
          .bindPopup(`🚗 รถส่งของ (ความแม่นยำ ${Math.round(accuracy)} ม.)`, { autoPan: false });

        // สร้าง Circle (วงแสดงรัศมี Accuracy)
        accuracyCircleRef.current = L.circle([lat, lng], { radius: accuracy, color: '#2563eb', fillOpacity: 0.1, weight: 1 })
          .addTo(mapInstanceRef.current);

        // เปิด Auto Pan ทันทีเมื่อเจอครั้งแรก
        shouldAutoPanRef.current = true;
        mapInstanceRef.current.setView([lat, lng], 17, { animate: true });
        onShowToast(`พบตำแหน่งแล้ว! (แม่นยำ ${Math.round(accuracy)} ม.)`, "success");

    } else {
        // อัปเดตตำแหน่งเดิม
        const newLatLng = new L.LatLng(lat, lng);
        userMarkerRef.current.setLatLng(newLatLng);
        userMarkerRef.current.setPopupContent(`🚗 รถส่งของ (ความแม่นยำ ${Math.round(accuracy)} ม.)`);
        
        // หมุนลูกศร (Rotation)
        if (heading !== null && !isNaN(heading)) {
            const iconElement = userMarkerRef.current.getElement();
            if (iconElement) {
                const arrowDiv = iconElement.querySelector('#user-heading-arrow');
                if (arrowDiv) {
                    arrowDiv.style.transform = `rotate(${heading}deg)`;
                }
            }
        }
        
        if (accuracyCircleRef.current) {
            accuracyCircleRef.current.setLatLng(newLatLng);
            accuracyCircleRef.current.setRadius(accuracy);
        }

        // Pan ตามเฉพาะเมื่อ shouldAutoPan ยังเป็น true
        if (shouldAutoPanRef.current) {
            mapInstanceRef.current.panTo(newLatLng, { animate: true, duration: 0.5 });
        }
    }
  };

  const drawRoute = async (destLat: number, destLng: number, isBackgroundUpdate = false) => {
    if (!mapInstanceRef.current) return;
    const L = window.L;

    // บันทึกเป้าหมายปัจจุบันไว้ เพื่อใช้คำนวณใหม่ตอนรถขยับ
    activeDestinationRef.current = { lat: destLat, lng: destLng };

    if (!isBackgroundUpdate) {
        document.body.style.cursor = 'wait';
        onShowToast("กำลังคำนวณเส้นทาง...", "info");
    }

    // 1. เตรียมพิกัดเริ่มต้น (อยู่นอก Try/Catch เพื่อให้ Fallback ใช้งานได้)
    let startLat = SHOP_LOCATION.lat;
    let startLng = SHOP_LOCATION.lng;
    let usingShopLocation = true;

    // พยายามหาจุดเริ่มต้นที่ดีที่สุด: Marker ล่าสุด -> GPS ปัจจุบัน -> ร้าน
    if (userMarkerRef.current) {
      const latlng = userMarkerRef.current.getLatLng();
      startLat = latlng.lat;
      startLng = latlng.lng;
      usingShopLocation = false;
    } else if ('geolocation' in navigator && isTracking) {
      try {
         // ลองขอ GPS ล่าสุดแบบเร็วๆ
         const position: any = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000, enableHighAccuracy: false });
         });
         startLat = position.coords.latitude;
         startLng = position.coords.longitude;
         usingShopLocation = false;
      } catch (e) {
         // Fail silently on background update
         if (!isBackgroundUpdate) console.log("Quick GPS for route failed, using shop/last known");
      }
    } 

    // บันทึกจุดที่ใช้คำนวณล่าสุด
    lastRouteCalcPosRef.current = { lat: startLat, lng: startLng };

    if (usingShopLocation && !isBackgroundUpdate) {
       onShowToast("ไม่พบพิกัดปัจจุบัน ใช้ตำแหน่งร้านเป็นจุดเริ่ม", "info");
    }

    // --- SMART ROUTING: ตรวจสอบระยะทางก่อน ---
    const distanceMeters = getDistanceMeters(startLat, startLng, destLat, destLng);
    
    // ถ้าใกล้กว่า 100 เมตร: ไม่ต้องใช้ API, วาดเส้นตรงเลย
    if (distanceMeters < 100) {
        if (routeLayerRef.current) mapInstanceRef.current.removeLayer(routeLayerRef.current);
        
        if (!isBackgroundUpdate) onShowToast(`อยู่ใกล้เป้าหมาย (${Math.round(distanceMeters)} ม.)`, "success");
        setRouteStats({ distance: `${Math.round(distanceMeters)} ม.`, duration: 'ใกล้ถึงแล้ว' });

        routeLayerRef.current = L.polyline([[startLat, startLng], [destLat, destLng]], {
            color: '#10b981', // สีเขียว
            weight: 6,
            opacity: 0.9,
            dashArray: '1, 10',
            lineCap: 'round'
        }).addTo(mapInstanceRef.current);

        setTimeout(() => {
          if(routeLayerRef.current) {
            routeLayerRef.current.setStyle({ dashArray: null });
          }
        }, 100);

        if (!isBackgroundUpdate) {
            mapInstanceRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [100, 100] });
        }
        document.body.style.cursor = 'default';
        return; 
    }

    try {
      // 2. พยายามขอเส้นทางจาก OSRM
      const response = await fetchWithRetry(
        `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`,
        1, 
        1000
      );

      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const routeGeoJSON = data.routes[0].geometry;
        
        // ดึงข้อมูลระยะทางและเวลา
        const distKm = (data.routes[0].distance / 1000).toFixed(1);
        const durMin = Math.ceil(data.routes[0].duration / 60);
        setRouteStats({ distance: `${distKm} กม.`, duration: `${durMin} นาที` });

        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
        }

        // วาดเส้นทางจริง (สีฟ้า)
        routeLayerRef.current = L.geoJSON(routeGeoJSON, {
          style: {
            color: '#3b82f6',
            weight: 6,
            opacity: 0.8,
            lineCap: 'round',
            lineJoin: 'round',
            dashArray: isBackgroundUpdate ? null : '1, 10', 
          }
        }).addTo(mapInstanceRef.current);

        if (!isBackgroundUpdate) {
            setTimeout(() => {
                if(routeLayerRef.current) {
                    routeLayerRef.current.setStyle({ dashArray: null });
                }
            }, 100);
            mapInstanceRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
        }
        
      } else {
        throw new Error("No route found from API");
      }
    } catch (error) {
      console.warn("Routing API Failed, switching to fallback line:", error);
      
      // 3. Fallback Mode: วาดเส้นตรง
      if (routeLayerRef.current) {
        mapInstanceRef.current.removeLayer(routeLayerRef.current);
      }
      
      if (!isBackgroundUpdate) onShowToast("⚠️ ระบบนำทางขัดข้องชั่วคราว แสดงเส้นทางตรงแทน", "info");
      
      // คำนวณคร่าวๆ (เส้นตรง)
      setRouteStats({ distance: `${(distanceMeters/1000).toFixed(1)} กม.`, duration: '-' });

      routeLayerRef.current = L.polyline([[startLat, startLng], [destLat, destLng]], {
         color: '#f97316', 
         weight: 5,
         opacity: 0.8,
         dashArray: '10, 10',
         lineCap: 'round'
      }).addTo(mapInstanceRef.current);

      if (!isBackgroundUpdate) {
        mapInstanceRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
      }

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

        const { latitude, longitude, accuracy, heading } = position.coords;
        updateUserMarker(latitude, longitude, accuracy, heading);
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
        maximumAge: 0, 
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
    
    // ลบเส้น Radar เมื่อหยุดนำทาง
    directionLinesRef.current.forEach(line => line.remove());
    directionLinesRef.current = [];

    // Reset Route State
    activeDestinationRef.current = null;
    lastRouteCalcPosRef.current = null;
    setRouteStats(null);
    if (routeLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
    }

    releaseWakeLock();
    setIsTracking(false);
    setIs3DMode(false); // ปิดโหมด 3D อัตโนมัติเมื่อหยุดนำทาง
    shouldAutoPanRef.current = false; // Reset
    if (onTrackingChange) onTrackingChange(false);
  };

  // Toggle 3D Mode Function
  const toggle3DMode = () => {
    setIs3DMode(prev => !prev);
  };

  // Effect to apply 3D CSS class
  useEffect(() => {
    if (mapContainerRef.current) {
      if (is3DMode) {
        mapContainerRef.current.classList.add('mode-3d');
        onShowToast("เปิดมุมมอง 3D (Driver View)", "info");
      } else {
        mapContainerRef.current.classList.remove('mode-3d');
      }
    }
  }, [is3DMode, onShowToast]);

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
        setIs3DMode(true); // 🔥 Auto-enable 3D mode when tracking starts
        shouldAutoPanRef.current = true; // เปิด Auto Pan เมื่อเริ่ม
        if (onTrackingChange) onTrackingChange(true);
        requestWakeLock();

        // 🚀 KICKSTART STRATEGY 🚀
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (!userMarkerRef.current) {
                  updateUserMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.heading);
                }
            },
            (err) => { /* Ignore errors from kickstart */ },
            { 
                enableHighAccuracy: false, 
                timeout: 3000, 
                maximumAge: Infinity 
            }
        );

        // เริ่มต้นด้วย High Accuracy
        startWatchingPosition(true);
      }
    },
    resetToShop: () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([SHOP_LOCATION.lat, SHOP_LOCATION.lng], 16, { animate: true });
        
        // Reset Route UI but maybe keep destination? No, better clear it for fresh start.
        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
          routeLayerRef.current = null;
        }
        activeDestinationRef.current = null;
        setRouteStats(null);
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

      // 🔴 เพิ่ม Logic: ถ้า User เลื่อนหรือซูมแผนที่ ให้หยุด Auto Pan ทันที
      mapInstanceRef.current.on('dragstart', () => { shouldAutoPanRef.current = false; });
      mapInstanceRef.current.on('zoomstart', () => { shouldAutoPanRef.current = false; });

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
        // Logic เพื่อเพิ่มความสุภาพ (เติม "คุณ" ถ้ายังไม่มี และไม่ใช่ร้านค้า)
        const noPrefixNeeded = /^(ร้าน|บริษัท|หจก|โรงเรียน|วัด|ธนาคาร|คุณ|Mr\.|Ms\.|Mrs\.)/.test(point.name);
        const displayName = noPrefixNeeded ? point.name : `คุณ${point.name}`;

        const popupContent = document.createElement('div');
        popupContent.className = "text-center font-sans p-3 min-w-[350px]";
        
        popupContent.innerHTML = `
          <p class="text-xs text-gray-400 font-bold mb-0">ชื่อลูกค้า</p>
          <h3 class="font-extrabold text-2xl text-slate-900 mb-1 leading-tight tracking-tight">${displayName}</h3>
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

  return (
    <div className="relative w-full h-full">
        <div ref={mapContainerRef} className="w-full h-full z-0 transition-transform duration-700 ease-in-out" />
        
        {/* Toggle 2D/3D Button */}
        <button 
          onClick={toggle3DMode}
          className="absolute top-24 left-3 z-[1000] bg-white p-2 rounded-lg shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
          title={is3DMode ? "สลับเป็น 2D" : "สลับเป็น 3D"}
        >
            {is3DMode ? <Layers className="w-6 h-6 text-blue-600" /> : <Box className="w-6 h-6" />}
            <span className="sr-only">Toggle 3D</span>
        </button>

        {/* Route Statistics Panel */}
        {routeStats && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-blue-100 p-3 z-[1000] flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
                <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                    <div className="p-2 bg-blue-100 rounded-full">
                        <Navigation className="w-5 h-5 text-blue-600 fill-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ระยะทาง</p>
                        <p className="text-xl font-black text-slate-800 leading-none">{routeStats.distance}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100 rounded-full">
                         <Clock className="w-5 h-5 text-emerald-600" />
                    </div>
                     <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">เวลาโดยประมาณ</p>
                        <p className="text-xl font-black text-slate-800 leading-none">{routeStats.duration}</p>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
});

MapViewer.displayName = 'MapViewer';