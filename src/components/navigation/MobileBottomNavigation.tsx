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
} from "lucide-react";
import { cn } from "@/lib/utils";

export const MobileBottomNavigation: React.FC = () => {
  const pathname = usePathname();
  const { user } = useAuth();
  const isDriver = user?.role === "DRIVER";

  const customerItems = [
    { label: "Beranda", href: "/customer/dashboard", icon: LayoutDashboard },
    { label: "Pesan", href: "/customer/bookings/new", icon: PlusCircle },
    { label: "Riwayat", href: "/customer/trips", icon: History },
    { label: "Profil", href: "/customer/profile", icon: User },
  ];

  const driverItems = [
    { label: "Beranda", href: "/driver/dashboard", icon: LayoutDashboard },
    { label: "Order", href: "/driver/orders", icon: Radio },
    { label: "Aktif", href: "/driver/trips/active", icon: Car },
    { label: "Riwayat", href: "/driver/trips", icon: History },
    { label: "Profil", href: "/driver/profile", icon: User },
  ];

  const items = isDriver ? driverItems : customerItems;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-2px_8px_rgba(20,33,61,0.06)] px-2 py-1 safe-area-pb"
      aria-label="Navigasi Bawah Mobile"
    >
      <div className="flex items-center justify-around">
        {items.map((item) => {
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
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1.5 min-h-[48px] rounded-rf transition-colors",
                isActive ? "text-rf-blue" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <div
                className={cn(
                  "p-1 rounded-full transition-all",
                  isActive &&
                    "bg-blue-50 shadow-[inset_0_1px_2px_rgba(37,99,235,0.1)]"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5",
                    isActive ? "stroke-[2.4]" : "stroke-[1.8]"
                  )}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] mt-0.5",
                  isActive ? "font-bold text-rf-blue" : "font-medium"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

