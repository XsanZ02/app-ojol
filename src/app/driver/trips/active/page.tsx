"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TripTimeline } from "@/components/trip/TripTimeline";
import { RouteMap } from "@/components/booking/RouteMap";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { driverApi, bookingsApi } from "@/lib/api";
import { Booking, BookingStatus } from "@/types/booking";
import { formatIDR, formatDateTime, getStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastNotification";
import { useRouter } from "next/navigation";
import type { EventStreamConnectionState } from "@/lib/auth-api";
import {
  Car,
  Bike,
  User,
  Phone,
  MapPin,
  Navigation,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Flag,
  RotateCcw,
  Compass,
} from "lucide-react";

export default function DriverActiveTripPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [activeTrip, setActiveTrip] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [eventConnectionState, setEventConnectionState] =
    useState<EventStreamConnectionState>("connecting");

  const refreshActiveTrip = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await driverApi.getActiveTrip();
      setActiveTrip(data);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Perjalanan aktif tidak dapat dimuat."
      );
    }
  }, []);
  const activeTripId = activeTrip?.id;

  useEffect(() => {
    setIsLoading(true);
    void refreshActiveTrip().finally(() => setIsLoading(false));
  }, [refreshActiveTrip, user]);

  useEffect(() => {
    if (isLoading) return;

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshActiveTrip();
      }, 150);
    };
    const handleConnectionState = (state: EventStreamConnectionState) => {
      setEventConnectionState(state);
      if (state === "connected") scheduleRefresh();
    };
    const unsubscribe = activeTripId
      ? bookingsApi.subscribeToTripUpdates(
          activeTripId,
          scheduleRefresh,
          handleConnectionState
        )
      : driverApi.subscribeToAvailableOrderUpdates(
          scheduleRefresh,
          handleConnectionState
        );

    return () => {
      unsubscribe();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [activeTripId, isLoading, refreshActiveTrip]);

  // Determine next status and button label
  const getNextTransition = (
    currentStatus?: BookingStatus
  ): { nextStatus: BookingStatus; label: string; icon: React.ReactNode } | null => {
    switch (currentStatus) {
      case "ACCEPTED":
        return {
          nextStatus: "PICKING_UP",
          label: "Menuju Lokasi Jemput Penumpang",
          icon: <Navigation className="w-5 h-5 rotate-45" />,
        };
      case "PICKING_UP":
        return {
          nextStatus: "IN_PROGRESS",
          label: "Penumpang Sudah Naik — Mulai Perjalanan",
          icon: <Car className="w-5 h-5" />,
        };
      case "IN_PROGRESS":
        return {
          nextStatus: "COMPLETED",
          label: "Sampai di tujuan — selesaikan perjalanan",
          icon: <Flag className="w-5 h-5" />,
        };
      default:
        return null;
    }
  };

  const nextTransition = getNextTransition(activeTrip?.status);

  const handleProgressTrip = async (nextStatus: BookingStatus) => {
    if (!activeTrip) return;

    if (nextStatus === "COMPLETED") {
      setShowCompleteDialog(true);
      return;
    }

    setIsUpdating(true);
    try {
      const updated = await bookingsApi.updateStatus(activeTrip.id, nextStatus);
      setActiveTrip(updated);
      showToast(
        `Status berhasil diperbarui: ${getStatusLabel(nextStatus)}`,
        "success"
      );
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Gagal memperbarui status.",
        "error"
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmComplete = async () => {
    if (!activeTrip) return;
    setIsUpdating(true);
    try {
      await bookingsApi.updateStatus(activeTrip.id, "COMPLETED");
      setShowCompleteDialog(false);
      showToast(
        `Selamat! Perjalanan selesai. Tarif ${formatIDR(
          activeTrip.estimatedFare
        )} ditambahkan ke saldo hari ini.`,
        "success"
      );
      router.push("/driver/dashboard");
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Gagal menyelesaikan perjalanan.",
        "error"
      );
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout allowedRole="DRIVER">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="tactile-card p-8 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-rf-blue/20 border-t-rf-blue rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-rf-text">
              Memeriksa perjalanan aktif...
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!activeTrip) {
    return (
      <AppLayout allowedRole="DRIVER">
        <div className="max-w-2xl mx-auto py-10 space-y-6">
          {loadError ? (
            <div role="alert" className="rounded-rf border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
              <p>{loadError}</p>
              <TactileButton
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setIsLoading(true);
                  void refreshActiveTrip().finally(() => setIsLoading(false));
                }}
              >
                Coba Lagi
              </TactileButton>
            </div>
          ) : (
            <EmptyState
              icon={<Car className="w-10 h-10" />}
              title="Tidak Ada Perjalanan Aktif"
              description="Saat ini belum ada pesanan perjalanan yang berlangsung. Buka daftar pesanan untuk melihat permintaan baru."
              actionLabel="Lihat pesanan masuk"
              onAction={() => router.push("/driver/orders")}
            />
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout allowedRole="DRIVER">
      <div className="max-w-5xl mx-auto space-y-6">
        {loadError && (
          <div
            role="alert"
            className="rounded-rf border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            Data perjalanan belum berhasil disegarkan: {loadError}
          </div>
        )}
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-rf-navy">
                Kontrol Perjalanan Aktif
              </h1>
              <StatusBadge status={activeTrip.status} />
            </div>
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              ID Pesanan: {activeTrip.id} • Diterima: {formatDateTime(activeTrip.updatedAt)}
            </p>
            <p
              className={`mt-1 text-xs ${
                eventConnectionState === "connected"
                  ? "text-emerald-700"
                  : eventConnectionState === "disconnected"
                    ? "text-amber-700"
                    : "text-slate-500"
              }`}
              aria-live="polite"
            >
              {eventConnectionState === "connected"
                ? "Pembaruan langsung aktif"
                : eventConnectionState === "disconnected"
                  ? "Koneksi pembaruan langsung terputus"
                  : "Menghubungkan pembaruan langsung..."}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase block">
              Tarif Masuk
            </span>
            <span className="text-2xl font-black text-emerald-700">
              {formatIDR(activeTrip.estimatedFare)}
            </span>
          </div>
        </div>

        {/* Primary Driver Action Banner (Big Tactile Progression Button) */}
        {nextTransition && (
          <div className="p-5 bg-gradient-to-r from-blue-900 to-rf-navy text-white rounded-rf-xl border border-blue-800 shadow-tactile-card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                Langkah Operasional Berikutnya
              </span>
              <span className="text-xs font-semibold text-blue-300">
                Tahap {activeTrip.status === "ACCEPTED" ? "1/3" : activeTrip.status === "PICKING_UP" ? "2/3" : "3/3"}
              </span>
            </div>

            <TactileButton
              variant="primary"
              size="lg"
              className="w-full text-base py-4 h-14 bg-emerald-600 hover:bg-emerald-500 border-emerald-500 shadow-tactile-btn"
              onClick={() => handleProgressTrip(nextTransition.nextStatus)}
              isLoading={isUpdating}
              icon={nextTransition.icon}
            >
              {nextTransition.label}
            </TactileButton>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Customer details & Route progress */}
          <div className="md:col-span-7 space-y-5">
            {/* Customer Details Card */}
            <SurfaceCard className="p-5 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100 flex items-center justify-between">
                <span>Informasi Penumpang</span>
                <span className="text-rf-blue font-semibold">Detail Perjalanan</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 shrink-0 font-bold text-base shadow-sm">
                    {activeTrip.customerName?.charAt(0) || "?"}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-rf-text">
                      {activeTrip.customerName || "Informasi penumpang belum tersedia"}
                    </h3>
                    <p className="text-xs text-rf-text-secondary">
                      {activeTrip.customerName
                        ? "Pelanggan RideFlow"
                        : activeTrip.customerId
                          ? `ID Penumpang: ${activeTrip.customerId}`
                          : "Nama penumpang tidak tersedia"}
                    </p>
                    {activeTrip.customerName && activeTrip.customerId && (
                      <p className="text-xs text-slate-500">
                        ID Penumpang: {activeTrip.customerId}
                      </p>
                    )}
                  </div>
                </div>

                {activeTrip.customerPhone && (
                  <a
                    href={`tel:${activeTrip.customerPhone}`}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-rf border border-emerald-200 text-xs font-bold shadow-sm transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Hubungi {activeTrip.customerPhone}</span>
                  </a>
                )}
              </div>

              {activeTrip.tripNotes && (
                <div className="p-3 bg-amber-50/70 rounded-rf-sm border border-amber-200/80 text-xs text-amber-900">
                  <span className="font-bold block text-[10px] uppercase text-amber-700">
                    Catatan Penumpang:
                  </span>
                  <p className="mt-0.5 italic">&ldquo;{activeTrip.tripNotes}&rdquo;</p>
                </div>
              )}
            </SurfaceCard>

            {/* Route Waypoints Card */}
            <SurfaceCard className="p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Titik Koordinat & Panduan Rute
              </h3>

              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200 mt-0.5">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">
                      Titik Jemput
                    </span>
                    <p className="font-bold text-rf-text text-sm">
                      {activeTrip.pickup.name}
                    </p>
                    <p className="text-slate-500">{activeTrip.pickup.address}</p>
                    {activeTrip.pickup.notes && (
                      <p className="text-emerald-700 font-medium mt-0.5">
                        Patokan: {activeTrip.pickup.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 pt-3 border-t border-slate-100">
                  <div className="w-7 h-7 rounded-full bg-rf-navy text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Navigation className="w-4 h-4 rotate-45" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">
                      Titik Tujuan Akhir
                    </span>
                    <p className="font-bold text-rf-text text-sm">
                      {activeTrip.destination.name}
                    </p>
                    <p className="text-slate-500">{activeTrip.destination.address}</p>
                  </div>
                </div>
              </div>
            </SurfaceCard>

            {/* Trip Timeline Progress */}
            <SurfaceCard className="p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                Riwayat Status Perjalanan
              </h3>
              <TripTimeline
                status={activeTrip.status}
                statusHistory={activeTrip.statusHistory}
              />
            </SurfaceCard>
          </div>

          {/* Right Column: Map & Vehicle Dispatch Info */}
          <div className="md:col-span-5 space-y-4">
            <RouteMap
              pickup={activeTrip.pickup}
              destination={activeTrip.destination}
              routeGeometry={activeTrip.routeGeometry}
              className="h-56"
            />

            <SurfaceCard className="p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Informasi Kendaraan & Tarif
              </h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Jenis Layanan:</span>
                  <span className="font-bold text-rf-navy">
                    {activeTrip.vehicleType === "MOTOR"
                      ? "RideFlow Motor"
                      : "RideFlow Mobil"}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Estimasi Jarak Tempuh:</span>
                  <span className="font-bold text-rf-navy">
                    {activeTrip.estimatedDistanceKm === null
                      ? "Belum tersedia"
                      : `${activeTrip.estimatedDistanceKm.toFixed(1)} km`}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Perkiraan Waktu:</span>
                  <span className="font-bold text-rf-navy">
                    {activeTrip.estimatedDurationMin === null
                      ? "Belum tersedia"
                      : `± ${activeTrip.estimatedDurationMin} menit`}
                  </span>
                </div>
                <div className="flex justify-between py-1 pt-2">
                  <span className="text-slate-600 font-bold uppercase text-xs">
                    Penghasilan Bersih Mitra:
                  </span>
                  <span className="font-black text-emerald-700 text-base">
                    {formatIDR(activeTrip.estimatedFare)}
                  </span>
                </div>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog before marking trip as COMPLETED */}
      <ConfirmDialog
        isOpen={showCompleteDialog}
        title="Selesaikan Perjalanan Ini?"
        description={`Pastikan penumpang telah tiba di tujuan (${activeTrip.destination.name}). Tarif ${formatIDR(activeTrip.estimatedFare)} akan dicatat pada pendapatan perjalanan Anda.`}
        confirmLabel="Ya, Perjalanan Selesai"
        cancelLabel="Kembali"
        variant="primary"
        isLoading={isUpdating}
        onConfirm={handleConfirmComplete}
        onClose={() => setShowCompleteDialog(false)}
      />
    </AppLayout>
  );
}
