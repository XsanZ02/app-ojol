"use client";

import React, { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { AppHeader } from "@/components/navigation/AppHeader";
import { AppSidebar } from "@/components/navigation/AppSidebar";
import { MobileBottomNavigation } from "@/components/navigation/MobileBottomNavigation";
import { getProtectedRouteRedirect } from "@/lib/auth-api";

interface AppLayoutProps {
  children: React.ReactNode;
  allowedRole?: "CUSTOMER" | "DRIVER";
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  allowedRole,
}) => {
  const {
    user,
    isAuthenticated,
    isLoading,
    authError,
    refreshSession,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading || authError) return;
    const redirect = getProtectedRouteRedirect(user, allowedRole);
    if (redirect) router.replace(redirect);
  }, [isLoading, authError, user, allowedRole, router, pathname]);

  if (authError) {
    return (
      <div className="min-h-screen bg-rf-bg flex items-center justify-center p-4">
        <div className="tactile-card p-8 max-w-sm w-full space-y-4 text-center">
          <h3 className="text-base font-bold text-rf-text">
            Sesi RideFlow belum dapat diverifikasi
          </h3>
          <p className="text-xs text-rf-text-secondary">{authError}</p>
          <button
            type="button"
            onClick={() => void refreshSession()}
            className="w-full rounded-rf bg-rf-blue px-4 py-2 text-sm font-bold text-white"
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-rf-bg flex items-center justify-center p-4">
        <div className="tactile-card p-8 max-w-sm w-full space-y-4 text-center">
          <div className="w-12 h-12 rounded-full border-4 border-rf-blue/20 border-t-rf-blue animate-spin mx-auto" />
          <h3 className="text-base font-bold text-rf-text">Memuat RideFlow...</h3>
          <p className="text-xs text-rf-text-secondary">
            Menyiapkan preferensi & data rute perjalanan Anda
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || (allowedRole && user?.role !== allowedRole)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-rf-bg flex flex-col selection:bg-rf-blue selection:text-white pb-20 md:pb-6">
      <AppHeader />
      <div className="flex-1 flex w-full max-w-[1600px] mx-auto">
        <AppSidebar />
        <main className="flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      <MobileBottomNavigation />
    </div>
  );
};
