"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  PlusCircle,
  History,
  User,
  Radio,
  Car,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const AppSidebar: React.FC = () => {
  const pathname = usePathname();
  const { user } = useAuth();
  const isDriver = user?.role === "DRIVER";

  const customerNavItems = [
    {
      label: "Beranda",
      href: "/customer/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Pesan Perjalanan",
      href: "/customer/bookings/new",
      icon: PlusCircle,
    },
    {
      label: "Riwayat Perjalanan",
      href: "/customer/trips",
      icon: History,
    },
    {
      label: "Profil Saya",
      href: "/customer/profile",
      icon: User,
    },
  ];

  const driverNavItems = [
    {
      label: "Beranda Mitra",
      href: "/driver/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Pesanan Masuk",
      href: "/driver/orders",
      icon: Radio,
    },
    {
      label: "Perjalanan Aktif",
      href: "/driver/trips/active",
      icon: Car,
    },
    {
      label: "Riwayat Perjalanan",
      href: "/driver/trips",
      icon: History,
    },
    {
      label: "Profil Pengemudi",
      href: "/driver/profile",
      icon: User,
    },
  ];

  const navItems = isDriver ? driverNavItems : customerNavItems;

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 border-r border-slate-200/90 bg-white/80 shadow-[1px_0_3px_rgba(20,33,61,0.02)] min-h-[calc(100vh-4rem)] p-4">
      {/* Navigation Label */}
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Menu {isDriver ? "Mitra Pengemudi" : "Penumpang"}
      </div>

      {/* Nav Link Items */}
      <nav className="space-y-1.5 mt-1 flex-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/customer/dashboard" &&
              item.href !== "/driver/dashboard" &&
              pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3.5 py-2.5 rounded-rf text-sm font-semibold transition-all select-none min-h-[44px]",
                isActive
                  ? "bg-blue-50/80 text-rf-blue border border-blue-200/60 shadow-[inset_0_1px_0_#ffffff,0_1px_2px_rgba(37,99,235,0.08)]"
                  : "text-slate-600 hover:text-rf-text hover:bg-slate-100/80 border border-transparent"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 shrink-0 transition-colors",
                  isActive ? "text-rf-blue stroke-[2.2]" : "text-slate-400"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Modern Skeuomorphic Info Card on bottom sidebar */}
      <div className="mt-auto pt-4 border-t border-slate-100">
        <div className="p-3.5 bg-gradient-to-b from-slate-50 to-[#f1f5f9] rounded-rf border border-slate-200/90 shadow-[inset_0_1px_0_#ffffff,0_2px_4px_rgba(20,33,61,0.03)] text-xs text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-rf-navy">
            <Compass className="w-4 h-4 text-rf-blue" />
            <span>Area Layanan Bali</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Mencakup rute aktif: Denpasar, Renon, Panjer, Sanur & sekitarnya.
          </p>
        </div>
      </div>
    </aside>
  );
};
