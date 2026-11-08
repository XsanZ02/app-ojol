"use client";

import React from "react";
import { useAuth } from "@/lib/auth-context";
import { LogOut, User, Bike } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const AppHeader: React.FC = () => {
  const { user, logout } = useAuth();
  const isDriver = user?.role === "DRIVER";

  return (
    <header className="rf-glass-surface sticky top-0 z-40 flex h-16 w-full items-center justify-between border-x-0 border-t-0 px-4 lg:px-8">
      <div className="flex items-center gap-3">
        <Link
          href={isDriver ? "/driver/dashboard" : "/customer/dashboard"}
          className="flex items-center gap-2.5 group"
        >
          <div className="w-10 h-10 rounded-rf bg-gradient-to-br from-rf-navy to-rf-blue flex items-center justify-center text-white shadow-tactile-btn transition-transform group-hover:scale-105">
            <Bike className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-lg tracking-tight text-rf-navy flex items-center gap-1">
              Ride<span className="text-rf-blue">Flow</span>
            </span>
            <span className="text-[10px] font-semibold tracking-wide text-rf-text-secondary -mt-1 hidden sm:block">
              Perjalanan nyaman, setiap saat
            </span>
          </div>
        </Link>

        <span
          className={cn(
            "hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-[inset_0_1px_0_#ffffff]",
            isDriver
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : "bg-blue-50 text-blue-800 border-blue-200"
          )}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isDriver ? "bg-amber-500" : "bg-rf-blue"
            )}
          />
          {isDriver ? "Mode Mitra Pengemudi" : "Mode Penumpang"}
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href={isDriver ? "/driver/profile" : "/customer/profile"}
          className="flex items-center gap-2 p-1 pl-2 pr-2.5 rounded-full hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
        >
          <div className="w-8 h-8 rounded-full bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-slate-600" />
            )}
          </div>
          <span className="text-xs font-semibold text-rf-text hidden lg:inline max-w-[120px] truncate">
            {user?.name || "Pengguna"}
          </span>
        </Link>

        <button
          onClick={() => logout()}
          className="w-9 h-9 rounded-rf text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors border border-transparent hover:border-rose-100"
          title="Keluar dari akun"
          aria-label="Keluar dari akun RideFlow"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
