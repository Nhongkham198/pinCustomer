import React, { useState, useEffect } from 'react';
import { Store, Edit, X, Save, Trash2, Image as ImageIcon, Lock, ArrowRight, Loader2 } from 'lucide-react';

export const Header: React.FC = () => {
  // ใช้ Lazy Initialization เพื่อโหลดค่าจาก LocalStorage ตั้งแต่เริ่มต้น
  const [logo, setLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem('seoulgood_logo');
    } catch (e) {
      console.error("Error loading logo from storage", e);
      return null;
    }
  });
  
  // State สำหรับจัดการ Modal
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // State สำหรับ Input
  const [passwordInput, setPasswordInput] = useState('');
  const [urlInput, setUrlInput] = useState('');

  // เมื่อคลิกที่ Header
  const handleLogoClick = () => {
    setIsPasswordModalOpen(true);
    setPasswordInput('');
  };

  // ตรวจสอบรหัสผ่าน
  const handlePasswordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (passwordInput === '198') {
      setIsPasswordModalOpen(false); // ปิดหน้าต่างรหัสผ่าน
      // โหลดค่า Logo ปัจจุบันมารอไว้ใน Input เสมอ
      const currentLogo = localStorage.getItem('seoulgood_logo') || logo || '';
      // ถ้าเป็น Base64 (ยาวๆ) ไม่ต้องแสดงใน input ให้รก, หรือแสดงก็ได้ แต่ user มักจะก๊อป URL ใหม่ทับอยู่แล้ว
      // เช็คว่าเป็น URL ปกติไหม ถ้าใช่ก็แสดง ถ้าเป็น data:image... อาจจะแสดงว่า "ข้อมูลรูปภาพที่บันทึกไว้" หรือแสดงค่าเดิมก็ได้
      if (currentLogo.startsWith('data:')) {
         setUrlInput(''); // เคลียร์ให้ว่างเพื่อให้แปะลิงก์ใหม่ได้ง่าย หรือจะใส่ค่าเดิมก็ได้
      } else {
         setUrlInput(currentLogo);
      }
      setIsEditModalOpen(true);      // เปิดหน้าต่างแก้ไข
    } else {
      alert('รหัสผ่านไม่ถูกต้อง');
      setPasswordInput('');
    }
  };

  // ฟังก์ชันช่วยบันทึก URL ตรงๆ (กรณีโหลดภาพมาเก็บไม่ได้)
  const saveUrlDirectly = (url: string) => {
    try {
      localStorage.setItem('seoulgood_logo', url);
      setLogo(url);
      setIsEditModalOpen(false);
    } catch (error) {
      console.error("Storage failed:", error);
      alert("บันทึกไม่สำเร็จ! พื้นที่จัดเก็บเต็ม");
    } finally {
      setIsSaving(false);
    }
  };

  // บันทึกรูปภาพ (พยายามดึงข้อมูลภาพมาเก็บเป็น Base64 ถ้าทำได้)
  const handleSave = async () => {
    const valueToSave = urlInput.trim();
    
    if (!valueToSave) {
      setIsEditModalOpen(false);
      return;
    }

    setIsSaving(true);

    try {
      // 1. ลอง Fetch รูปภาพเพื่อแปลงเป็น Base64 (เพื่อให้ทำงาน Offline ได้)
      const response = await fetch(valueToSave);
      
      if (response.ok) {
        const blob = await response.blob();
        
        // ตรวจสอบขนาดไฟล์ (LocalStorage มักรับได้ไม่เกิน 5MB, เรากันไว้สัก 3MB)
        if (blob.size < 3 * 1024 * 1024) { 
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            try {
              localStorage.setItem('seoulgood_logo', base64data);
              setLogo(base64data);
              setIsEditModalOpen(false);
            } catch (e) {
              console.warn("Storage full for Base64, falling back to URL");
              saveUrlDirectly(valueToSave);
            } finally {
              setIsSaving(false);
            }
          };
          reader.onerror = () => saveUrlDirectly(valueToSave);
          reader.readAsDataURL(blob);
          return; // รอ Callback ของ reader
        } else {
           console.log("Image too large for storage, saving URL instead");
           saveUrlDirectly(valueToSave);
        }
      } else {
        // Fetch ไม่สำเร็จ (เช่น 404)
        saveUrlDirectly(valueToSave);
      }
    } catch (e) {
      // เกิด Error เช่น CORS (Server ปลายทางไม่อนุญาตให้ดึงข้อมูลตรงๆ)
      // ไม่ต้องตกใจ ให้บันทึกเป็น URL ธรรมดาแทน
      console.log("CORS or Network error, saving URL instead");
      saveUrlDirectly(valueToSave);
    }
  };

  // ลบรูปภาพ
  const handleDelete = () => {
    if (window.confirm('ยืนยันที่จะลบรูป Logo ออก?')) {
      try {
        localStorage.removeItem('seoulgood_logo');
        setLogo(null);
        setIsEditModalOpen(false);
      } catch (e) {
        console.error("Delete failed", e);
      }
    }
  };

  return (
    <>
      {/* --- Main Header --- */}
      <header className="bg-white h-16 border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-[1002] flex-shrink-0 relative">
        <div 
          onClick={handleLogoClick}
          className="flex items-center gap-4 cursor-pointer hover:bg-slate-50 p-2 -ml-2 rounded-xl transition-all duration-200 select-none group/header-click"
          title="คลิกเพื่อแก้ไข Logo"
        >
          <div className="relative w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm group-hover/header-click:ring-2 group-hover/header-click:ring-blue-200 transition-all">
            {logo ? (
              <img 
                src={logo} 
                alt="Store Logo" 
                className="w-full h-full object-cover" 
                onError={(e) => {
                   e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <Store className="w-5 h-5 text-slate-400" />
            )}
            
            {/* Hover overlay hint */}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover/header-click:opacity-100 transition-opacity">
               <Edit className="w-4 h-4 text-white" />
            </div>
          </div>
          
          <h1 className="text-xl font-extrabold text-slate-800 tracking-tight group-hover/header-click:text-blue-900 transition-colors">
            SeoulGood <span className="text-blue-600">routeline</span>
          </h1>
        </div>
      </header>

      {/* --- Password Modal --- */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-1">กรุณาใส่รหัสผ่าน</h3>
              <p className="text-gray-500 text-sm mb-6">เพื่อเข้าสู่โหมดแก้ไข Logo</p>
              
              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="รหัสผ่าน"
                  autoFocus
                  className="w-full px-4 py-3 text-center text-lg tracking-widest border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none mb-4"
                />
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsPasswordModalOpen(false)}
                    className="flex-1 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                  >
                    ยืนยัน <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* --- Edit Logo Modal --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-blue-600" />
                จัดการรูปภาพ Logo
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">ลิงก์รูปภาพ (URL)</label>
              <input 
                type="text" 
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="วางลิงก์รูปภาพที่นี่ (https://...)"
                className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all mb-4 outline-none"
                autoFocus
              />
              
              {urlInput && (
                <div className="mb-4 flex justify-center bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300">
                  <img 
                    src={urlInput} 
                    alt="Preview" 
                    className="h-24 w-24 object-contain rounded-full bg-white shadow-sm" 
                    onError={(e) => (e.currentTarget.style.display = 'none')} 
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  ลบรูป
                </button>
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-[2] py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};