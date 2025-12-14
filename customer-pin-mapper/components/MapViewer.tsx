import React, { useEffect, useRef } from 'react';
import { CustomerPoint } from '../types';

interface MapViewerProps {
  points: CustomerPoint[];
  onDeletePoint: (id: string) => void;
}

declare global {
  interface Window {
    L: any;
  }
}

// พิกัดร้านของคุณ
const SHOP_LOCATION = { lat: 16.43624, lng: 103.5020 };

export const MapViewer: React.FC<MapViewerProps> = ({ points, onDeletePoint }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapContainerRef.current || !window.L) return;

    const L = window.L;

    // Initialize Map if not already
    if (!mapInstanceRef.current) {
      // ตั้งค่าเริ่มต้นให้ไปที่ร้านเลย
      mapInstanceRef.current = L.map(mapContainerRef.current).setView([SHOP_LOCATION.lat, SHOP_LOCATION.lng], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstanceRef.current);

      // --- สร้างหมุดร้านถาวร (Icon สีแดง) ---
      const shopIcon = L.divIcon({
        className: 'custom-shop-icon',
        html: `<div style="
          background-color: #ef4444; 
          width: 32px; 
          height: 32px; 
          border-radius: 50%; 
          border: 3px solid white; 
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16], // Center icon
        popupAnchor: [0, -16]
      });

      L.marker([SHOP_LOCATION.lat, SHOP_LOCATION.lng], { icon: shopIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div class="text-center font-sans pt-2 min-w-[200px]">
            <h3 class="font-bold text-xl text-red-600 mb-0">ร้านของเรา</h3>
            <p class="text-base text-gray-500 mb-2 font-medium">จุดเริ่มต้นส่งสินค้า</p>
          </div>
        `);

      // Fix: Force map to recalculate size after render to prevent grey areas
      setTimeout(() => {
        mapInstanceRef.current.invalidateSize();
      }, 200);
    }

    const map = mapInstanceRef.current;

    // Clear existing customer markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Bounds management: เริ่มต้นด้วยพิกัดร้านเสมอ
    const bounds = L.latLngBounds();
    bounds.extend([SHOP_LOCATION.lat, SHOP_LOCATION.lng]);

    if (points.length === 0) {
      // ถ้าไม่มีลูกค้า ให้กลับไปโฟกัสที่ร้าน
      map.setView([SHOP_LOCATION.lat, SHOP_LOCATION.lng], 13);
    } else {
      // Add Customer Markers
      points.forEach(point => {
        // สร้าง HTML Element สำหรับ Popup เพื่อใส่ Event Listener ได้ง่ายๆ
        const popupContent = document.createElement('div');
        // ปรับ min-w เป็น 350px เพื่อให้กว้างพอสำหรับปุ่ม
        popupContent.className = "text-center font-sans p-3 min-w-[350px]";
        
        // ใช้ innerHTML สร้างโครงสร้าง UI
        popupContent.innerHTML = `
          <h3 class="font-extrabold text-2xl text-slate-900 mb-1 leading-tight tracking-tight mt-1">${point.name}</h3>
          <p class="text-sm text-gray-400 mb-4 font-mono">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</p>
          
          <div class="flex flex-col gap-2">
            <!-- เพิ่ม !text-white เพื่อบังคับตัวหนังสือสีขาว -->
            <a href="https://www.google.com/maps/dir/${SHOP_LOCATION.lat},${SHOP_LOCATION.lng}/${point.lat},${point.lng}" 
               target="_blank" 
               class="block w-full bg-blue-600 hover:bg-blue-700 !text-white text-lg font-bold py-3 px-4 rounded-xl transition-all no-underline shadow-sm flex items-center justify-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
               นำทาง (จากร้าน)
            </a>
            
            <button class="btn-delete block w-full bg-white border-2 border-red-100 hover:bg-red-50 text-red-600 text-sm font-bold py-2 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
               ลบหมุดนี้
            </button>
          </div>
        `;

        // ผูกฟังก์ชันลบหมุด
        const deleteBtn = popupContent.querySelector('.btn-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', () => {
             const password = prompt(`ต้องการลบหมุด "${point.name}" ใช่ไหม?\nกรุณาใส่รหัสผ่านเพื่อยืนยัน:`);
             if (password === '198') {
               onDeletePoint(point.id);
             } else if (password !== null) {
               alert('รหัสผ่านไม่ถูกต้อง! ไม่สามารถลบได้');
             }
          });
        }

        const marker = L.marker([point.lat, point.lng])
          .addTo(map)
          // เพิ่ม minWidth: 350 ที่ตัว bindPopup ด้วยเพื่อให้ Leaflet รับทราบ
          .bindPopup(popupContent, { maxWidth: 500, minWidth: 350 }); 
        
        markersRef.current.push(marker);
        bounds.extend([point.lat, point.lng]);
      });

      // Zoom ให้เห็นทั้งร้านและลูกค้าทุกคน
      map.fitBounds(bounds, { padding: [50, 50] });
    }

  }, [points, onDeletePoint]);

  return <div ref={mapContainerRef} className="w-full h-full z-0" />;
};