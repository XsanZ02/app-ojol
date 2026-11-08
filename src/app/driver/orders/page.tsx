"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { RouteMap } from "@/components/booking/RouteMap";
import { bookingsApi, driverApi } from "@/lib/api";
import { AuthApiError } from "@/lib/auth-api";
import type { EventStreamConnectionState } from "@/lib/auth-api";
import { Booking } from "@/types/booking";
import { formatIDR, formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastNotification";
import { useRouter } from "next/navigation";
import {
  Radio,
  MapPin,
  Navigation,
  CheckCircle,
  FileText,
  Clock,
  Car,
  Bike,
  User,
  ArrowRight,
} from "lucide-react";

export default function DriverOrdersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<Booking[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Booking | null>(null);
  const [isAcceptingId, setIsAcceptingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<EventStreamConnectionState>("connecting");
  const fetchSequence = useRef(0);

  const getEligibilityErrorMessage = useCallback((error: unknown): string => {
    if (
      error instanceof AuthApiError &&
      (error.status === 403 || error.code === "driver_not_eligible")
    ) {
      return "Anda belum dapat menerima pesanan. Lengkapi profil, pastikan kendaraan telah diverifikasi, lalu aktifkan status tersedia.";
    }
    return error instanceof Error ? error.message : "Pesanan tidak dapat dimuat.";
  }, []);

  const fetchOrders = useCallback(async () => {
    const requestSequence = ++fetchSequence.current;
    setLoadError(null);
    try {
      const data = await bookingsApi.getAvailableBookings();
      if (requestSequence !== fetchSequence.current) return;
      setOrders(data);
      setSelectedOrder((current) =>
        data.find((order) => order.id === current?.id) ?? data[0] ?? null
      );
    } catch (error) {
      if (requestSequence === fetchSequence.current) {
        setLoadError(getEligibilityErrorMessage(error));
      }
    } finally {
      if (requestSequence === fetchSequence.current) setIsLoading(false);
    }
  }, [getEligibilityErrorMessage]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    return driverApi.subscribeToAvailableOrderUpdates(
      () => {
        void fetchOrders();
      },
      (state) => {
        setConnectionState(state);
        if (state === "connected") void fetchOrders();
      },
      (error) => showToast(error.message, "error")
    );
  }, [fetchOrders, showToast]);

  const handleAcceptOrder = async (bookingId: string) => {
    setIsAcceptingId(bookingId);
    try {
      if (!(await driverApi.getOnlineStatus())) {
        showToast("Aktifkan status tersedia di beranda sebelum menerima pesanan.", "error");
        return;
      }
      const accepted = await bookingsApi.accept(bookingId);
      showToast(`Pesanan ${accepted.id} berhasil diterima. Membuka perjalanan aktif...`, "success");
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

  return (
    <AppLayout allowedRole="DRIVER">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-rf-navy">
                Pesanan Masuk
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-rf-blue">
                {orders.length} Permintaan
              </span>
            </div>
            <p className="text-xs text-rf-text-secondary mt-0.5">
              Pesanan siap jemput di wilayah Denpasar, Renon, Sanur, dan Panjer
            </p>
            <p
              className={`mt-1 text-[11px] font-medium ${
                connectionState === "connected"
                  ? "text-emerald-700"
                  : "text-amber-700"
              }`}
              aria-live="polite"
            >
              {connectionState === "connected"
                ? "Notifikasi pesanan langsung aktif"
                : connectionState === "reconnecting"
                  ? "Menyambungkan ulang notifikasi..."
                  : connectionState === "disconnected"
                    ? "Koneksi notifikasi terhenti"
                    : "Menghubungkan notifikasi langsung..."}
            </p>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="tactile-card p-6 h-48 animate-pulse bg-slate-100" />
            <div className="tactile-card p-6 h-48 animate-pulse bg-slate-100" />
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-rf border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {loadError}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<Radio className="w-8 h-8" />}
            title="Tidak Ada Pesanan Tersedia Saat Ini"
            description="Semua pesanan saat ini sudah diambil atau belum ada penumpang baru yang memesan. Tetap pantau radar ini."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Orders List */}
            <div className="lg:col-span-7 space-y-4">
              {orders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                const isMotor = order.vehicleType === "MOTOR";

                return (
                  <SurfaceCard
                    key={order.id}
                    className={`p-5 transition-all cursor-pointer ${
                      isSelected
                        ? "border-rf-blue ring-2 ring-blue-500/20 shadow-tactile-card-hover"
                        : "hover:border-slate-300"
                    }`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {order.id}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-rf-text-secondary">
                          {formatDateTime(order.createdAt)}
                        </span>
                      </div>
                      <span className="text-lg font-black text-emerald-700">
                        {formatIDR(order.estimatedFare)}
                      </span>
                    </div>

                    {/* Customer & Route info */}
                    <div className="py-3.5 space-y-3">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-rf-text">
                          {order.customerName || "Informasi penumpang belum tersedia"}
                        </span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-500 font-medium">
                          {order.estimatedDistanceKm === null
                            ? "Jarak belum tersedia"
                            : `${order.estimatedDistanceKm.toFixed(1)} km`}
                          {order.estimatedDurationMin === null
                            ? ""
                            : ` (~${order.estimatedDurationMin} mnt)`}
                        </span>
                      </div>

                      <div className="flex items-start gap-2.5 text-xs">
                        <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-400 font-bold text-[10px] uppercase block">
                            Lokasi Penjemputan
                          </span>
                          <span className="font-bold text-rf-text">
                            {order.pickup.name}
                          </span>
                          <span className="text-slate-500 block truncate">
                            {order.pickup.address}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 text-xs">
                        <Navigation className="w-4 h-4 text-rf-blue rotate-45 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-slate-400 font-bold text-[10px] uppercase block">
                            Tujuan Akhir
                          </span>
                          <span className="font-bold text-rf-text">
                            {order.destination.name}
                          </span>
                          <span className="text-slate-500 block truncate">
                            {order.destination.address}
                          </span>
                        </div>
                      </div>

                      {order.tripNotes && (
                        <div className="p-2.5 bg-slate-50 rounded-rf-sm text-xs text-slate-700 border border-slate-200">
                          <span className="font-bold text-slate-500">Catatan: </span>
                          <span>&ldquo;{order.tripNotes}&rdquo;</span>
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded text-xs font-semibold text-slate-700">
                        {isMotor ? (
                          <Bike className="w-3.5 h-3.5 text-rf-blue" />
                        ) : (
                          <Car className="w-3.5 h-3.5 text-rf-blue" />
                        )}
                        <span>{isMotor ? "Motor" : "Mobil"}</span>
                      </div>

                      <TactileButton
                        variant="primary"
                        size="md"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcceptOrder(order.id);
                        }}
                        isLoading={isAcceptingId === order.id}
                        icon={<CheckCircle className="w-4 h-4" />}
                      >
                        Terima Pesanan
                      </TactileButton>
                    </div>
                  </SurfaceCard>
                );
              })}
            </div>

            {/* Map & Selected Order Focus (Right Column) */}
            <div className="lg:col-span-5 space-y-4">
              <RouteMap
                pickup={selectedOrder?.pickup}
                destination={selectedOrder?.destination}
                routeGeometry={selectedOrder?.routeGeometry}
                className="h-64"
              />

              {selectedOrder && (
                <SurfaceCard className="p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-100">
                    <span>Pratinjau Rute Terpilih</span>
                    <span className="text-rf-blue font-mono">{selectedOrder.id}</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jarak Tempuh:</span>
                      <span className="font-bold text-rf-navy">
                        {selectedOrder.estimatedDistanceKm === null
                          ? "Belum tersedia"
                          : `${selectedOrder.estimatedDistanceKm.toFixed(1)} km`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Perkiraan Durasi:</span>
                      <span className="font-bold text-rf-navy">
                        {selectedOrder.estimatedDurationMin === null
                          ? "Belum tersedia"
                          : `± ${selectedOrder.estimatedDurationMin} menit`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Estimasi Bersih:</span>
                      <span className="font-extrabold text-emerald-700 text-sm">
                        {formatIDR(selectedOrder.estimatedFare)}
                      </span>
                    </div>
                  </div>

                  <TactileButton
                    variant="primary"
                    size="lg"
                    className="w-full mt-2"
                    onClick={() => handleAcceptOrder(selectedOrder.id)}
                    isLoading={isAcceptingId === selectedOrder.id}
                    icon={<CheckCircle className="w-4 h-4" />}
                  >
                    Terima Order Sekarang ({formatIDR(selectedOrder.estimatedFare)})
                  </TactileButton>
                </SurfaceCard>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
