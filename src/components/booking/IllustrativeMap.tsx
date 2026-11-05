import React from "react";
import { LocationPoint } from "@/types/booking";
import { MapPin, Navigation, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

interface IllustrativeMapProps {
  pickup?: LocationPoint | null;
  destination?: LocationPoint | null;
  className?: string;
  driverPosition?: { lat: number; lng: number } | null;
  interactive?: boolean;
}

export const IllustrativeMap: React.FC<IllustrativeMapProps> = ({
  pickup,
  destination,
  className,
}) => {
  return (
    <div
      className={cn(
        "relative w-full h-64 md:h-80 rounded-rf-md overflow-hidden border border-slate-200/90 shadow-[inset_0_2px_4px_rgba(20,33,61,0.06)] bg-[#eef3f9]",
        className
      )}
    >
      {/* Background Cartographic Grid & Roads */}
      <svg
        className="absolute inset-0 w-full h-full text-slate-300"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="mapGrid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(203, 213, 225, 0.45)"
              strokeWidth="1"
            />
          </pattern>
          <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>

        {/* Base Grid */}
        <rect width="100%" height="100%" fill="#f1f5f9" />
        <rect width="100%" height="100%" fill="url(#mapGrid)" />

        {/* Coastal / Green park areas (Denpasar & Sanur representation) */}
        <path
          d="M 280,0 Q 330,120 380,240 T 480,400 L 800,400 L 800,0 Z"
          fill="#e0f2fe"
          opacity="0.6"
        />
        <circle cx="90" cy="180" r="45" fill="#dcfce7" opacity="0.5" />
        <circle cx="210" cy="90" r="30" fill="#dcfce7" opacity="0.6" />

        {/* Major Road Arteries (e.g. By Pass Ngurah Rai, Jl. Raya Puputan, Jl. Diponegoro) */}
        {/* Main arterial 1 */}
        <path
          d="M -20,70 C 120,80 200,60 380,140 S 520,260 700,280"
          fill="none"
          stroke="#ffffff"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M -20,70 C 120,80 200,60 380,140 S 520,260 700,280"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="8"
          strokeLinecap="round"
        />

        {/* Main arterial 2 */}
        <path
          d="M 120,-20 C 130,100 150,180 220,360"
          fill="none"
          stroke="#ffffff"
          strokeWidth="10"
        />
        <path
          d="M 120,-20 C 130,100 150,180 220,360"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="6"
        />

        {/* Cross road 3 */}
        <path
          d="M 40,240 C 150,220 280,250 450,220"
          fill="none"
          stroke="#ffffff"
          strokeWidth="8"
        />
        <path
          d="M 40,240 C 150,220 280,250 450,220"
          fill="none"
          stroke="#cbd5e1"
          strokeWidth="4"
        />

        {/* Connecting Trip Route Line when pickup & destination exist */}
        <path
          d="M 110,190 C 130,140 180,130 250,95"
          fill="none"
          stroke="#93c5fd"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="4 6"
        />
        <path
          d="M 110,190 C 130,140 180,130 250,95"
          fill="none"
          stroke="url(#routeGradient)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>

      {/* Region Area Badges */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 bg-white/90 backdrop-blur-md rounded-full border border-slate-200/90 shadow-sm text-xs font-semibold text-slate-700">
        <Compass className="w-3.5 h-3.5 text-rf-blue" />
        <span>Denpasar • Panjer • Renon • Sanur</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/80 backdrop-blur-md rounded-full text-[11px] font-medium text-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Peta Ilustratif Prototipe</span>
      </div>

      {/* Pickup Marker Pin */}
      <div className="absolute left-[26%] top-[56%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[11px] font-bold shadow-tactile-card whitespace-nowrap mb-1">
          <span>Jemput:</span>
          <span className="font-medium max-w-[110px] truncate">
            {pickup?.name || "Panjer / Titik Jemput"}
          </span>
        </div>
        <div className="relative flex items-center justify-center">
          <span className="absolute w-7 h-7 rounded-full bg-emerald-500/30 animate-ping" />
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-tactile-btn border-2 border-white z-10">
            <MapPin className="w-4 h-4 fill-white" />
          </div>
        </div>
        <div className="w-2.5 h-1 bg-slate-400/50 rounded-full blur-[1px] mt-0.5" />
      </div>

      {/* Destination Marker Pin */}
      <div className="absolute left-[62%] top-[24%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-rf-navy text-white rounded-md text-[11px] font-bold shadow-tactile-card whitespace-nowrap mb-1">
          <span>Tujuan:</span>
          <span className="font-medium max-w-[110px] truncate">
            {destination?.name || "Renon / Sanur"}
          </span>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-rf-navy text-white flex items-center justify-center shadow-tactile-btn border-2 border-white z-10">
            <Navigation className="w-4 h-4 fill-white rotate-45" />
          </div>
        </div>
        <div className="w-2.5 h-1 bg-slate-400/50 rounded-full blur-[1px] mt-0.5" />
      </div>

      {/* Bottom Info Bar */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-rf border border-slate-200/90 shadow-tactile-card text-xs text-rf-text-secondary">
        <span className="font-medium">
          Rute Optimal: Jl. Raya Puputan & Tukad Barito
        </span>
        <span className="font-semibold text-rf-text">Area Layanan Bali</span>
      </div>
    </div>
  );
};

