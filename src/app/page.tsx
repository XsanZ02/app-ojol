"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getRoleHomePath } from "@/lib/auth-api";

export default function HomePage() {
  const router = useRouter();
  const {
    user,
    isAuthenticated,
    isLoading,
    authError,
    refreshSession,
  } = useAuth();

  useEffect(() => {
    if (isLoading || authError) return;

    if (!isAuthenticated || !user) {
      router.replace("/login");
    } else {
      router.replace(getRoleHomePath(user));
    }
  }, [isAuthenticated, isLoading, authError, user, router]);

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

  return (
    <div className="min-h-screen bg-rf-bg flex items-center justify-center p-4">
      <div className="tactile-card p-8 max-w-sm w-full space-y-4 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-rf-blue/20 border-t-rf-blue animate-spin mx-auto" />
        <h3 className="text-base font-bold text-rf-text">RideFlow</h3>
        <p className="text-xs text-rf-text-secondary">
          Mengarahkan ke dashboard Anda...
        </p>
      </div>
    </div>
  );
}
