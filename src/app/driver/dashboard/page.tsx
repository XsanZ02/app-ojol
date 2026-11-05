"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { AvailabilityToggle } from "@/components/ui/AvailabilityToggle";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { bookingsApi, driverApi } from "@/lib/api";
import type {
  DriverApiProfile,
  DriverStatistics,
  DriverVehicle,
} from "@/lib/api";
import { Booking } from "@/types/booking";
import { formatIDR, formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastNotification";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bike,
  Car,
  Star,
  TrendingUp,
  Award,
  Radio,
  MapPin,
  Navigation,
  ArrowRight,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function DriverDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [availableRequests, setAvailableRequests] = useState<Booking[]>([]);
  const [activeTrip, setActiveTrip] = useState<Booking | null>(null);
  const [isAcceptingId, setIsAcceptingId] = useState<string | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<DriverApiProfile | null>(null);
  const [vehicles, setVehicles] = useState<DriverVehicle[]>([]);
  const [statistics, setStatistics] = useState<DriverStatistics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeVehicle = vehicles.find(
    (vehicle) => vehicle.isActive && vehicle.verificationStatus === "verified"
  );
  const canGoOnline = profile?.status === "active" && !!activeVehicle;

  const fetchDriverData = useCallback(async () => {
    setLoadError(null);
    setIsLoading(true);
    try {
      const [driverProfile, driverVehicles, online, stats, active] =
        await Promise.all([
          driverApi.getProfile(),
          driverApi.getVehicles(),
          driverApi.getOnlineStatus(),
          driverApi.getStatistics(),
          driverApi.getActiveTrip(),
        ]);
      setProfile(driverProfile);
      setVehicles(driverVehicles);
      setIsOnline(online);
      setStatistics(stats);
      setActiveTrip(active);

      setAvailableRequests(
        online ? await bookingsApi.getAvailableBookings() : []
      );
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Data dashboard tidak dapat dimuat."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDriverData();
  }, [fetchDriverData, user?.id]);

  const handleToggleAvailability = async () => {
    setIsTogglingStatus(true);
    try {
      const newStatus = await driverApi.setOnlineStatus(!isOnline);
      setIsOnline(newStatus);
      showToast(
        newStatus
          ? "Status aktif: Anda sekarang ONLINE dan dapat menerima pesanan."
          : "Status istirahat: Anda sekarang OFFLINE.",
        "info"
      );
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Gagal memperbarui status ketersediaan.",
        "error"
      );
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleAcceptRide = async (bookingId: string) => {
    if (!isOnline) {
      showToast("Aktifkan status ONLINE terlebih dahulu untuk menerima order.", "error");
      return;
    }

    setIsAcceptingId(bookingId);
    try {
      const accepted = await bookingsApi.accept(bookingId);
      showToast(`Pesanan ${accepted.id} berhasil diterima! Segera jemput penumpang.`, "success");
      router.push("/driver/trips/active");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Gagal menerima pesanan.",
        "error"
      );
    } finally {
      setIsAcceptingId(null);
    }
  };

  const isMotor = activeVehicle?.vehicleType === "MOTOR";

  return (
    <AppLayout allowedRole="DRIVER">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header & Availability Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black text-rf-navy">
                Dashboard Mitra Pengemudi
              </h1>
              {activeVehicle && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  {isMotor ? "Motor" : "Mobil"}
                </span>
              )}
            </div>
            <p className="text-xs text-rf-text-secondary mt-1">
              Selamat bertugas, {user?.name}! Pantau performa dan pesanan yang tersedia.
            </p>
          </div>

          {/* Physical Tactile Availability Toggle */}
          <AvailabilityToggle
            isOnline={isOnline === true}
            onToggle={handleToggleAvailability}
            loading={isLoading}
            unavailable={isOnline === null && !isLoading}
            disabled={
              isLoading || isTogglingStatus || (isOnline !== true && !canGoOnline)
            }
          />
        </div>

        {loadError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-rf border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <span>{loadError}</span>
            <TactileButton
              variant="secondary"
              size="sm"
              onClick={fetchDriverData}
              disabled={isLoading}
            >
              Coba Lagi
            </TactileButton>
          </div>
        )}

        {/* 4 Stat Summary Cards (Modern Skeuomorphism) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Earnings Today */}
          <SurfaceCard className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Pendapatan Hari Ini
              </span>
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-sm">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700">
                {statistics ? formatIDR(statistics.todayEarnings) : "—"}
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1">
                Berdasarkan tarif final perjalanan selesai
              </p>
            </div>
          </SurfaceCard>

          {/* Trips Today */}
          <SurfaceCard className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Tarikan Hari Ini
              </span>
              <div className="w-7 h-7 rounded-full bg-blue-50 text-rf-blue flex items-center justify-center border border-blue-200 shadow-sm">
                <CheckCircle className="w-3.5 h-3.5" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-rf-navy">
                {statistics ? `${statistics.todayTrips} Trip` : "—"}
              </div>
              <p className="text-[10px] text-slate-500 font-medium mt-1">
                Total Selesai: {statistics?.completedTrips ?? "—"}
              </p>
            </div>
          </SurfaceCard>

          {/* Driver Rating */}
          <SurfaceCard className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Rating Kepuasan
              </span>
              <div className="w-7 h-7 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shadow-sm">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-black text-amber-800 flex items-baseline gap-1.5">
                <span>{statistics?.rating ?? "—"}</span>
                {statistics?.rating !== null && statistics?.rating !== undefined && (
                  <span className="text-xs font-semibold text-slate-400">/ 5.0</span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-medium mt-1">
                {statistics
                  ? `${statistics.totalRatingsCount} ulasan bintang`
                  : "Jumlah ulasan belum tersedia"}
              </p>
            </div>
          </SurfaceCard>

          {/* Vehicle Info */}
          <SurfaceCard className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Kendaraan Aktif
              </span>
              <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200 shadow-sm">
                {activeVehicle ? (
                  isMotor ? (
                    <Bike className="w-3.5 h-3.5" />
                  ) : (
                    <Car className="w-3.5 h-3.5" />
                  )
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
              </div>
            </div>
            <div>
              {activeVehicle ? (
                <>
                  <div className="text-sm font-bold text-rf-navy truncate">
                    {[activeVehicle.make, activeVehicle.model].filter(Boolean).join(" ")}
                  </div>
                  <div className="font-mono text-xs font-bold text-rf-blue mt-0.5">
                    {activeVehicle.vehiclePlate}
                  </div>
                </>
              ) : (
                <div className="text-xs font-medium text-slate-500">
                  Belum ada kendaraan aktif terverifikasi
                </div>
              )}
            </div>
          </SurfaceCard>
        </div>

        {/* Ongoing Active Trip Card Banner (If Driver currently has accepted order) */}
        {activeTrip && (
          <div className="p-5 bg-gradient-to-r from-blue-950 to-rf-navy rounded-rf-lg border border-blue-800 shadow-tactile-card text-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-800/80">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping shrink-0" />
                <div>
                  <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">
                    Tarikan Sedang Berjalan
                  </span>
                  <h3 className="text-base font-bold text-white">
                    Order ID: {activeTrip.id}
                  </h3>
                </div>
              </div>

              <StatusBadge status={activeTrip.status} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-blue-100">
                    Jemput: <strong>{activeTrip.pickup.name}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-blue-300 rotate-45 shrink-0" />
                  <span className="text-blue-100">
                    Tujuan: <strong>{activeTrip.destination.name}</strong>
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 md:pt-0">
                <div>
                  <span className="text-[10px] text-blue-300 uppercase font-bold block">
                    Penumpang
                  </span>
                  <span className="text-sm font-bold text-white">
                    {activeTrip.customerName || "Informasi penumpang belum tersedia"}
                  </span>
                </div>

                <Link href="/driver/trips/active">
                  <TactileButton
                    variant="primary"
                    size="md"
                    className="w-full sm:w-auto"
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Buka Kontrol Perjalanan
                  </TactileButton>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Available Orders Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-rf-blue animate-pulse" />
              <h2 className="text-lg font-bold text-rf-navy">
                Pesanan Masuk Sekitar Anda
              </h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-rf-blue">
                {availableRequests.length} Tersedia
              </span>
            </div>

            <Link
              href="/driver/orders"
              className="text-xs font-bold text-rf-blue hover:underline"
            >
              Lihat Semua Radar Order
            </Link>
          </div>

          {isOnline === null ? (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-rf-md text-center text-sm text-slate-600">
              Status online belum tersedia. Muat ulang data dashboard untuk mencoba kembali.
            </div>
          ) : !isOnline ? (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-rf-md text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
              <h3 className="text-base font-bold text-amber-900">
                {!canGoOnline
                  ? "Profil atau kendaraan belum memenuhi syarat online"
                  : "Anda Sedang Offline"}
              </h3>
              <p className="text-xs text-amber-700 max-w-sm mx-auto">
                {!canGoOnline
                  ? "Status online memerlukan profil pengemudi aktif dan kendaraan aktif yang telah terverifikasi."
                  : "Silakan aktifkan status ONLINE untuk menerima pesanan."}
              </p>
              <TactileButton
                variant="primary"
                size="sm"
                onClick={handleToggleAvailability}
                disabled={!canGoOnline || isTogglingStatus}
                isLoading={isTogglingStatus}
              >
                Aktifkan Status Online Sekarang
              </TactileButton>
            </div>
          ) : availableRequests.length === 0 ? (
            <EmptyState
              icon={<Radio className="w-6 h-6" />}
              title="Belum Ada Pesanan Baru"
              description="Belum ada permintaan perjalanan yang tersedia untuk kendaraan Anda."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableRequests.map((req) => (
                <SurfaceCard key={req.id} className="p-5 flex flex-col justify-between">
                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {req.id}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-rf-text-secondary">
                          {formatDateTime(req.createdAt)}
                        </span>
                      </div>
                      <span className="text-base font-extrabold text-emerald-700">
                        {formatIDR(req.estimatedFare)}
                      </span>
                    </div>

                    {/* Customer info & Route */}
                    <div className="py-3 space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Penumpang:</span>
                        <span className="font-bold text-rf-text">
                          {req.customerName || "Informasi penumpang belum tersedia"}
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 text-xs">
                        <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px] uppercase">
                            Jemput
                          </span>
                          <span className="font-semibold text-rf-text">
                            {req.pickup.name}
                          </span>
                          <span className="text-slate-500 block truncate">
                            {req.pickup.address}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 text-xs">
                        <Navigation className="w-4 h-4 text-rf-blue rotate-45 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px] uppercase">
                            Tujuan
                          </span>
                          <span className="font-semibold text-rf-text">
                            {req.destination.name}
                          </span>
                          <span className="text-slate-500 block truncate">
                            {req.destination.address}
                          </span>
                        </div>
                      </div>

                      {req.tripNotes && (
                        <div className="p-2 bg-slate-50 rounded-rf-sm text-xs text-slate-600 border border-slate-200">
                          <span className="font-bold text-slate-500">Catatan: </span>
                          <span>&ldquo;{req.tripNotes}&rdquo;</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Accept Button */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 font-medium">
                      Estimasi jarak: {req.estimatedDistanceKm} km
                    </span>
                    <TactileButton
                      variant="primary"
                      size="sm"
                      onClick={() => handleAcceptRide(req.id)}
                      isLoading={isAcceptingId === req.id}
                      icon={<CheckCircle className="w-4 h-4" />}
                    >
                      Terima Pesanan Ini
                    </TactileButton>
                  </div>
                </SurfaceCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
