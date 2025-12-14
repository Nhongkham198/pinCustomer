import React, { useState, useEffect } from 'react';
import { MapViewer } from './components/MapViewer';
import { DataInput } from './components/DataInput';
import { Header } from './components/Header';
import { CustomerPoint } from './types';

const App: React.FC = () => {
  // 1. Initialize state from localStorage if available
  const [points, setPoints] = useState<CustomerPoint[]>(() => {
    try {
      const saved = localStorage.getItem('customerPoints');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load points", e);
      return [];
    }
  });

  // 2. Auto-save to localStorage whenever points change
  useEffect(() => {
    localStorage.setItem('customerPoints', JSON.stringify(points));
  }, [points]);

  // 3. Updated handler to support "Append" mode
  const handleDataParsed = (newPoints: CustomerPoint[], append: boolean) => {
    if (newPoints.length === 0 && !append) {
      // Clear all data
      if (window.confirm("คุณต้องการลบข้อมูลหมุดทั้งหมดใช่หรือไม่?")) {
        setPoints([]);
      }
      return;
    }

    if (append) {
      // Append new points to existing ones
      setPoints(prev => [...prev, ...newPoints]);
    } else {
      // Replace existing points
      setPoints(newPoints);
    }
  };

  const handleDeletePoint = (id: string) => {
    setPoints(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-100 flex flex-col">
      
      {/* Header */}
      <Header />

      {/* Main Map Area */}
      <div className="flex-1 w-full relative">
         <MapViewer points={points} onDeletePoint={handleDeletePoint} />
      </div>

      {/* Controls */}
      <DataInput onDataParsed={handleDataParsed} points={points} />

    </div>
  );
};

export default App;