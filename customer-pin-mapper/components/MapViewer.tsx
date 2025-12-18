import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { CustomerPoint, MapViewerHandle } from '../types';
import { Navigation, Clock, Box, Layers, ArrowRight, ArrowLeft, ArrowUp, MapPin, AlertTriangle, ExternalLink } from 'lucide-react';

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
  const directionLinesRef = useRef<any[]>([]); 
  
  // State สำหรับ Tracking
  const [isTracking, setIsTracking] = useState(false);
  const [is3DMode, setIs3DMode] = useState(false);
  
  // State สำหรับข้อมูลเส้นทาง (ระยะทาง/เวลา)
  const [routeStats, setRouteStats] = useState<{ distance: string, duration: string } | null>(null);

  // State สำหรับ Turn-by-Turn Navigation
  const [navInstruction, setNavInstruction] = useState<{
    text: string;
    distance: number;
    modifier?: string; // left, right, straight
    type?: string;
    urgency: 'normal' | 'warning' | 'critical'; // ระดับความเร่งด่วน
  } | null>(null);

  const userMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null); 
  const watchIdRef = useRef<number | null>(null);
  const fallbackTimeoutRef = useRef<any>(null); 
  const wakeLockRef = useRef<any>(null);
  
  // Ref เก็บข้อมูลเส้นทาง (Steps) เพื่อใช้คำนวณ Real-time
  const routeStepsRef = useRef<any[]>([]);
  const activeDestinationRef = useRef<{lat: number, lng: number} | null>(null);
  const lastRouteCalcPosRef = useRef<{lat: number, lng: number} | null>(null);

  const shouldAutoPanRef = useRef(false);

  // ฟังก์ชันขอ Wake Lock
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err: any) { }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {}
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

  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Logic อัปเดตคำสั่งนำทาง (Turn-by-Turn)
  const updateNavigationInstruction = (userLat: number, userLng: number) => {
    if (routeStepsRef.current.length === 0) return;

    let closestStepIndex = -1;
    let minDistance = Infinity;

    // หาจุดบนเส้นทางที่ใกล้ที่สุด
    for (let i = 0; i < routeStepsRef.current.length; i++) {
        const step = routeStepsRef.current[i];
        const dist = getDistanceMeters(userLat, userLng, step.maneuver.location[1], step.maneuver.location[0]);
        if (dist < minDistance) {
            minDistance = dist;
            closestStepIndex = i;
        }
    }

    if (closestStepIndex !== -1 && closestStepIndex < routeStepsRef.current.length - 1) {
        let targetStepIndex = closestStepIndex + 1;
        const targetStep = routeStepsRef.current[targetStepIndex];
        const distToTarget = getDistanceMeters(userLat, userLng, targetStep.maneuver.location[1], targetStep.maneuver.location[0]);

        let instruction = targetStep.maneuver.modifier || targetStep.maneuver.type;
        // แปลงเป็นไทยง่ายๆ
        let text = "";
        const mod = targetStep.maneuver.modifier;
        
        if (mod?.includes('left')) text = "เลี้ยวซ้าย";
        else if (mod?.includes('right')) text = "เลี้ยวขวา";
        else if (mod?.includes('slight left')) text = "เบี่ยงซ้าย";
        else if (mod?.includes('slight right')) text = "เบี่ยงขวา";
        else if (mod?.includes('uturn')) text = "กลับรถ";
        else if (targetStep.maneuver.type === 'arrive') text = "ถึงจุดหมาย";
        else text = "ตรงไป"; 

        // 🚨 Logic ความเร่งด่วน (Urgency) 🚨
        let urgency: 'normal' | 'warning' | 'critical' = 'normal';
        const finalDist = Math.round(distToTarget);

        if (finalDist <= 40) { // ระยะ 40 เมตร (เผื่อ GPS ดีเลย์ = 20 เมตรจริง) -> เตือนวิกฤต
            urgency = 'critical';
            if (!text.includes("ถึง")) text = `! ${text} ทันที !`;
        } else if (finalDist <= 100) { // ระยะ 100 เมตร -> เตือนให้เตรียมตัว
            urgency = 'warning';
            if (!text.includes("ถึง")) text = `เตรียม ${text}`;
        }

        setNavInstruction({
            text: text,
            distance: finalDist,
            modifier: mod,
            type: targetStep.maneuver.type,
            urgency: urgency
        });
    } else if (closestStepIndex === routeStepsRef.current.length - 1) {
         setNavInstruction({
            text: "กำลังจะถึงจุดหมาย",
            distance: Math.round(minDistance),
            type: 'arrive',
            urgency: minDistance < 50 ? 'critical' : 'warning'
        });
    }
  };

  const updateNearestLines = (userLat: number, userLng: number) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;
    directionLinesRef.current.forEach(line => line.remove());
    directionLinesRef.current = [];
    if (points.length === 0) return;
    const candidates = points.map(p => ({
        ...p,
        distance: getDistanceMeters(userLat, userLng, p.lat, p.lng)
    }));
    const nearestPoints = candidates.sort((a, b) => a.distance - b.distance).slice(0, 5);
    nearestPoints.forEach(p => {
        const line = L.polyline([[userLat, userLng], [p.lat, p.lng]], {
            color: '#f97316', weight: 2, dashArray: '5, 10', opacity: 0.6, interactive: false
        }).addTo(mapInstanceRef.current);
        directionLinesRef.current.push(line);
    });
  };

  // Helper: สร้าง/อัปเดตหมุดตำแหน่งผู้ใช้
  const updateUserMarker = (lat: number, lng: number, accuracy: number, heading: number | null) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L = window.L;

    updateNearestLines(lat, lng);
    updateNavigationInstruction(lat, lng); 

    // Auto Reroute Logic
    if (activeDestinationRef.current && lastRouteCalcPosRef.current) {
        const distFromLastCalc = getDistanceMeters(
            lat, lng, 
            lastRouteCalcPosRef.current.lat, lastRouteCalcPosRef.current.lng
        );
        if (distFromLastCalc > 50) { 
             // TODO: Reroute logic
        }
    }

    // 🔴 ROTATION LOGIC
    if (is3DMode && mapContainerRef.current) {
        if (heading !== null && !isNaN(heading)) {
            mapContainerRef.current.style.setProperty('--map-bearing', `-${heading}deg`);
        }
    }

    if (!userMarkerRef.current) {
       const userIcon = L.divIcon({
          className: 'user-location-icon',
          html: `
            <div id="user-heading-arrow" style="transform: rotate(0deg); transition: transform 0.3s ease; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.3));">
                <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; overflow: visible;">
                    <path d="M50 0 L100 100 L50 80 L0 100 Z" fill="#ef4444" stroke="white" stroke-width="6" stroke-linejoin="round" />
                </svg>
            </div>
          `,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -20]
        });

        userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 9999 })
          .addTo(mapInstanceRef.current);

        accuracyCircleRef.current = L.circle([lat, lng], { radius: accuracy, color: '#2563eb', fillOpacity: 0.1, weight: 1 })
          .addTo(mapInstanceRef.current);

        shouldAutoPanRef.current = true;
        mapInstanceRef.current.setView([lat, lng], 18, { animate: true }); 

    } else {
        const newLatLng = new L.LatLng(lat, lng);
        userMarkerRef.current.setLatLng(newLatLng);
        
        if (accuracyCircleRef.current) {
            accuracyCircleRef.current.setLatLng(newLatLng);
            accuracyCircleRef.current.setRadius(accuracy);
        }

        if (shouldAutoPanRef.current) {
            mapInstanceRef.current.panTo(newLatLng, { animate: true, duration: 0.3 }); 
        }
    }
  };

  const drawRoute = async (destLat: number, destLng: number, isBackgroundUpdate = false) => {
    if (!mapInstanceRef.current) return;
    const L = window.L;

    activeDestinationRef.current = { lat: destLat, lng: destLng };

    if (!isBackgroundUpdate) {
        document.body.style.cursor = 'wait';
        onShowToast("กำลังคำนวณเส้นทาง...", "info");
    }

    let startLat = SHOP_LOCATION.lat;
    let startLng = SHOP_LOCATION.lng;
    
    if (userMarkerRef.current) {
      const latlng = userMarkerRef.current.getLatLng();
      startLat = latlng.lat;
      startLng = latlng.lng;
    } else if ('geolocation' in navigator && isTracking) {
      try {
         const position: any = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2000, enableHighAccuracy: false });
         });
         startLat = position.coords.latitude;
         startLng = position.coords.longitude;
      } catch (e) {}
    } 

    lastRouteCalcPosRef.current = { lat: startLat, lng: startLng };

    const distanceMeters = getDistanceMeters(startLat, startLng, destLat, destLng);
    
    if (distanceMeters < 50) { 
        setRouteStats({ distance: `${Math.round(distanceMeters)} ม.`, duration: 'ถึงแล้ว' });
        setNavInstruction({ text: "ถึงจุดหมายแล้ว", distance: 0, type: 'arrive', urgency: 'critical' });
        return; 
    }

    try {
      const response = await fetchWithRetry(
        `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`,
        1, 1000
      );

      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const routeGeoJSON = route.geometry;
        
        routeStepsRef.current = route.legs[0].steps;

        const distKm = (route.distance / 1000).toFixed(1);
        const durMin = Math.ceil(route.duration / 60);
        setRouteStats({ distance: `${distKm} กม.`, duration: `${durMin} นาที` });

        updateNavigationInstruction(startLat, startLng);

        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
        }

        routeLayerRef.current = L.geoJSON(routeGeoJSON, {
          style: {
            color: '#3b82f6', weight: 8, opacity: 0.8, lineCap: 'round', lineJoin: 'round'
          }
        }).addTo(mapInstanceRef.current);

        if (!isBackgroundUpdate) {
            mapInstanceRef.current.fitBounds(routeLayerRef.current.getBounds(), { padding: [50, 50] });
        }
        
      } else {
        throw new Error("No route found");
      }
    } catch (error) {
       if (routeLayerRef.current) mapInstanceRef.current.removeLayer(routeLayerRef.current);
       routeLayerRef.current = L.polyline([[startLat, startLng], [destLat, destLng]], {
         color: '#f97316', weight: 5, dashArray: '10, 10'
      }).addTo(mapInstanceRef.current);
    } finally {
      document.body.style.cursor = 'default';
    }
  };

  const startWatchingPosition = (enableHighAccuracy: boolean) => {
    if (!('geolocation' in navigator) || !mapInstanceRef.current) return;
    
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);

    const message = enableHighAccuracy ? "กำลังจับดาวเทียม GPS..." : "กำลังค้นหาตำแหน่ง...";
    onShowToast(message, "info");

    if (enableHighAccuracy) {
      fallbackTimeoutRef.current = setTimeout(() => {
        if (!userMarkerRef.current) startWatchingPosition(false);
      }, 8000); 
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
        const { latitude, longitude, accuracy, heading } = position.coords;
        updateUserMarker(latitude, longitude, accuracy, heading);
      },
      (error) => { /* Error Handling */ },
      { enableHighAccuracy: enableHighAccuracy, maximumAge: 0, timeout: 10000 } 
    );
  };

  const stopTrackingInternal = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    releaseWakeLock();
    setIsTracking(false);
    setIs3DMode(false);
    shouldAutoPanRef.current = false;
    if (mapContainerRef.current) mapContainerRef.current.style.setProperty('--map-bearing', '0deg');
    if (onTrackingChange) onTrackingChange(false);
  };

  const toggle3DMode = () => {
    setIs3DMode(prev => {
        const next = !prev;
        if (next) {
            onShowToast("เปิดโหมดนำทาง 3D", "info");
        } else if (mapContainerRef.current) {
            mapContainerRef.current.style.setProperty('--map-bearing', '0deg');
        }
        return next;
    });
  };

  useEffect(() => {
    if (mapContainerRef.current) {
      if (is3DMode) {
        mapContainerRef.current.classList.add('mode-3d');
      } else {
        mapContainerRef.current.classList.remove('mode-3d');
      }
    }
  }, [is3DMode]);

  useImperativeHandle(ref, () => ({
    toggleTracking: () => {
      if (isTracking) {
        stopTrackingInternal();
        onShowToast("หยุดนำทาง", "info");
      } else {
        setIsTracking(true);
        setIs3DMode(true); 
        shouldAutoPanRef.current = true; 
        if (onTrackingChange) onTrackingChange(true);
        requestWakeLock();
        startWatchingPosition(true);
        onShowToast("เริ่มนำทาง!", "success");
        onShowToast("เปิดโหมดนำทาง 3D", "info");
      }
    },
    resetToShop: () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setView([SHOP_LOCATION.lat, SHOP_LOCATION.lng], 16, { animate: true });
        if (routeLayerRef.current) {
          mapInstanceRef.current.removeLayer(routeLayerRef.current);
          routeLayerRef.current = null;
        }
        activeDestinationRef.current = null;
        setRouteStats(null);
        setNavInstruction(null);
        routeStepsRef.current = [];
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

  useEffect(() => {
    if (!mapContainerRef.current || !window.L) return;
    const L = window.L;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, { zoomControl: false }).setView([SHOP_LOCATION.lat, SHOP_LOCATION.lng], 13);
      L.control.zoom({ position: 'topleft' }).addTo(mapInstanceRef.current);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(mapInstanceRef.current);

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
        .bindPopup(`ร้าน`, { autoPan: true });
      
      setTimeout(() => { mapInstanceRef.current.invalidateSize(); }, 200);
    }

    const map = mapInstanceRef.current;
    
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    const bounds = L.latLngBounds();
    bounds.extend([SHOP_LOCATION.lat, SHOP_LOCATION.lng]);

    if (points.length > 0) {
      points.forEach(point => {
        const noPrefixNeeded = /^(ร้าน|บริษัท|หจก|โรงเรียน|วัด|ธนาคาร|คุณ|Mr\.|Ms\.|Mrs\.)/.test(point.name);
        const displayName = noPrefixNeeded ? point.name : `คุณ${point.name}`;

        const popupContent = document.createElement('div');
        popupContent.className = "text-center font-sans p-3 min-w-[350px]";
        popupContent.innerHTML = `
          <h3 class="font-extrabold text-2xl text-slate-900 mb-1 leading-tight tracking-tight">${displayName}</h3>
          <div class="flex flex-col gap-2 mt-2">
            <button class="btn-in-app-route block w-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mb-1">
               นำทาง (ในแอป)
            </button>
            <button class="btn-external-maps block w-full bg-slate-800 hover:bg-black text-white text-lg font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mb-1">
               <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
               Google Maps (ภายนอก)
            </button>
            <button class="btn-finish-job block w-full bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-bold py-3 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 mb-1">
               ✅ ส่งสำเร็จ (ถ่ายรูป)
            </button>
            <button class="btn-delete block w-full text-red-300 hover:text-red-500 text-xs font-bold py-2 px-4 mt-2">ลบหมุด (Admin)</button>
          </div>
        `;

        const routeBtn = popupContent.querySelector('.btn-in-app-route');
        if (routeBtn) {
          routeBtn.addEventListener('click', () => { drawRoute(point.lat, point.lng); map.closePopup(); });
        }
        
        const externalBtn = popupContent.querySelector('.btn-external-maps');
        if (externalBtn) {
          externalBtn.addEventListener('click', () => {
            window.open(`https://www.google.com/maps?q=${point.lat},${point.lng}`, '_blank');
          });
        }

        const finishBtn = popupContent.querySelector('.btn-finish-job');
        if (finishBtn) {
          finishBtn.addEventListener('click', () => { onFinishJob(point); map.closePopup(); });
        }
        const deleteBtn = popupContent.querySelector('.btn-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                const password = prompt("ใส่รหัส Admin เพื่อลบ:");
                if (password === '198') onDeletePoint(point.id);
            });
        }

        const marker = L.marker([point.lat, point.lng]).addTo(map).bindPopup(popupContent, { maxWidth: 500, minWidth: 350 }); 
        markersRef.current.push(marker);
        bounds.extend([point.lat, point.lng]);
      });
    }
  }, [points, onDeletePoint, onFinishJob, onShowToast]);

  return (
    <div className="relative w-full h-full bg-slate-100">
        <div ref={mapContainerRef} className="w-full h-full z-0 transition-transform duration-300 ease-linear" />
        
        <button 
          onClick={toggle3DMode}
          className="absolute top-36 left-3 z-[1000] bg-white p-2 rounded-lg shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
        >
            {is3DMode ? <Layers className="w-6 h-6 text-blue-600" /> : <Box className="w-6 h-6" />}
        </button>

        {/* 🟢 Turn-by-Turn Overlay 🟢 */}
        {navInstruction && isTracking && (
             <div 
               className={`absolute top-2 left-2 right-2 md:left-1/2 md:-translate-x-1/2 md:w-96 backdrop-blur-md rounded-2xl shadow-2xl border p-4 z-[1050] flex items-center gap-4 animate-in slide-in-from-top-4 transition-colors duration-300
                 ${navInstruction.urgency === 'critical' ? 'bg-emerald-600/95 border-emerald-500 text-white' : 
                   navInstruction.urgency === 'warning' ? 'bg-amber-500/95 border-amber-400 text-white' : 
                   'bg-slate-900/90 border-slate-700 text-white'}
               `}
             >
                 <div className={`p-3 rounded-full flex-shrink-0 bg-white/20 ${navInstruction.urgency === 'critical' ? 'animate-pulse' : ''}`}>
                    {navInstruction.text.includes('ซ้าย') ? <ArrowLeft className="w-8 h-8 text-white" /> :
                     navInstruction.text.includes('ขวา') ? <ArrowRight className="w-8 h-8 text-white" /> :
                     navInstruction.text.includes('ถึง') ? <MapPin className="w-8 h-8 text-white" /> :
                     navInstruction.text.includes('เตรียม') ? <AlertTriangle className="w-8 h-8 text-white" /> :
                     <ArrowUp className="w-8 h-8 text-white" />}
                 </div>
                 <div className="flex-1">
                     <p className="text-3xl font-black leading-none mb-1">{navInstruction.distance} <span className="text-sm font-normal opacity-80">เมตร</span></p>
                     <p className={`text-xl font-bold ${navInstruction.urgency === 'critical' ? 'text-white' : 'text-slate-100'}`}>
                       {navInstruction.text}
                     </p>
                 </div>
             </div>
        )}

        {/* Route Stats */}
        {routeStats && !navInstruction && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border border-blue-100 p-3 z-[1000] flex items-center gap-4">
                <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
                    <Navigation className="w-5 h-5 text-blue-600" />
                    <p className="text-xl font-black text-slate-800">{routeStats.distance}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-600" />
                    <p className="text-xl font-black text-slate-800">{routeStats.duration}</p>
                </div>
            </div>
        )}
    </div>
  );
});

MapViewer.displayName = 'MapViewer';