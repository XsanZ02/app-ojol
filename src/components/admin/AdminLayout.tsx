"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CarFront,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { adminApi, AuthApiError, getRoleHomePath } from "@/lib/auth-api";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "Ringkasan", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Manajemen Pengguna", href: "/admin/users", icon: Users },
  { label: "Mitra Pengemudi", href: "/admin/drivers", icon: CarFront },
  { label: "Verifikasi Mitra", href: "/admin/verification", icon: ShieldCheck },
  { label: "Manajemen Pesanan", href: "/admin/orders", icon: ShoppingBag },
  { label: "Pembayaran & Laporan", href: "/admin/reports", icon: BarChart3 },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isAuthenticated, isLoading, authError, refreshSession, logout } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessCheckAttempt, setAccessCheckAttempt] = useState(0);

  useEffect(() => {
    if (isLoading || authError) return;
    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "ADMIN") {
      router.replace(getRoleHomePath(user));
      return;
    }

    let active = true;
    setIsCheckingAccess(true);
    setAccessError(null);
    adminApi
      .getAccess()
      .then((access) => {
        if (!active) return;
        if (!access.authorized || access.subject !== user.id) {
          setIsAuthorized(false);
          router.replace("/login?error=admin_access_denied");
          return;
        }
        setIsAuthorized(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setIsAuthorized(false);
        if (error instanceof AuthApiError && error.status === 401) {
          router.replace("/login");
        } else if (error instanceof AuthApiError && error.status === 403) {
          router.replace("/login?error=admin_access_denied");
        } else {
          setAccessError(
            error instanceof Error
              ? error.message
              : "Akses administrator belum dapat diverifikasi."
          );
        }
      })
      .finally(() => {
        if (active) setIsCheckingAccess(false);
      });

    return () => {
      active = false;
    };
  }, [accessCheckAttempt, authError, isAuthenticated, isLoading, router, user]);

  if (isLoading || isCheckingAccess || !isAuthorized) {
    if (authError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-rf-bg p-4">
          <div className="tactile-card w-full max-w-sm space-y-4 p-8 text-center">
            <h1 className="font-bold text-rf-text">
              Sesi RideFlow belum dapat diverifikasi
            </h1>
            <p className="text-sm text-rf-text-secondary">{authError}</p>
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

    if (accessError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-rf-bg p-4">
          <div className="tactile-card w-full max-w-sm space-y-4 p-8 text-center">
            <h1 className="font-bold text-rf-text">
              Akses administrator belum terverifikasi
            </h1>
            <p className="text-sm text-rf-text-secondary">{accessError}</p>
            <button
              type="button"
              onClick={() => {
                setIsAuthorized(false);
                setAccessCheckAttempt((attempt) => attempt + 1);
              }}
              className="w-full rounded-rf bg-rf-blue px-4 py-2 text-sm font-bold text-white"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={() => router.replace("/login?error=admin_access_unavailable")}
              className="w-full rounded-rf border border-slate-200 px-4 py-2 text-sm font-bold text-rf-text"
            >
              Kembali ke halaman aman
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-rf-bg p-4">
        <div className="tactile-card space-y-3 p-8 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-rf-blue/20 border-t-rf-blue" />
          <p className="text-sm font-semibold text-rf-text">
            Memverifikasi akses administrator...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rf-bg pb-36 md:pb-0">
      <header className="rf-glass-surface sticky top-0 z-30 border-x-0 border-t-0">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6">
          <Link
            href="/admin/dashboard"
            className="flex items-center gap-3"
            aria-label="RideFlow Admin dashboard"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-rf bg-gradient-to-br from-rf-navy to-rf-blue text-white shadow-tactile-btn">
              <CarFront className="h-5 w-5" />
            </span>
            <span className="font-extrabold tracking-tight text-rf-navy">
              Ride<span className="text-rf-blue">Flow</span>
              <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rf-blue">
                Admin
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-bold text-rf-text">{user?.name}</p>
              <p className="text-xs text-rf-text-secondary">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex min-h-10 items-center gap-2 rounded-rf border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="hidden min-h-[calc(100vh-4rem)] w-72 shrink-0 border-r border-slate-200/90 bg-white p-4 md:flex md:flex-col">
          <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Panel Administrator
          </p>
          <nav aria-label="Navigasi administrator" className="mt-1 flex-1 space-y-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = item.href === pathname;
              const classes = cn(
                "flex min-h-11 items-center gap-3 rounded-rf border px-3.5 py-2.5 text-sm font-semibold",
                active
                  ? "border-blue-200/60 bg-blue-50/80 text-rf-blue"
                  : "border-transparent text-slate-600 transition hover:border-slate-200 hover:bg-slate-50"
              );
              return item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={classes}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              ) : (
                <div
                  key={item.label}
                  aria-disabled="true"
                  className={cn(classes, "justify-between")}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wide">
                    Segera
                  </span>
                </div>
              );
            })}
          </nav>
          <div className="mt-4 rounded-rf border border-blue-100 bg-blue-50 p-3 text-xs leading-relaxed text-blue-800">
            Panel hanya menampilkan data yang tersedia dari backend.
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      <nav
        aria-label="Navigasi administrator mobile"
        className="rf-glass-surface fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="grid grid-cols-3 gap-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = item.href === pathname;
            const content = (
              <>
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </>
            );
            const classes = cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-rf px-1 text-[10px] font-semibold",
              active ? "bg-blue-50 text-rf-blue" : "text-slate-600"
            );
            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={classes}
              >
                {content}
              </Link>
            ) : (
              <div
                key={item.label}
                aria-disabled="true"
                className={classes}
                title="Fitur belum tersedia"
              >
                {content}
              </div>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
