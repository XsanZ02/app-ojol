"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RouteMap } from "@/components/booking/RouteMap";
import { bookingsApi, driverApi } from "@/lib/api";
import { Booking } from "@/types/booking";
import { formatIDR, formatDateTime } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastNotification";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  CheckCircle,
  User,
  Clock,
  Bike,
  Car,
  AlertCircle,
} from "lucide-react";

export default function DriverOrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const data = await driverApi.getAvailableOrderById(orderId);
        setOrder(data);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Rincian pesanan tidak dapat dimuat."
        );
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  const handleAccept = async () => {
    if (!order) return;

    setIsAccepting(true);
    try {
      if (!(await driverApi.getOnlineStatus())) {
        showToast("Aktifkan status ONLINE terlebih dahulu.", "error");
        return;
      }
      await bookingsApi.accept(order.id);
      showToast("Pesanan berhasil diterima! Mengalihkan...", "success");
      router.push("/driver/trips/active");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Gagal menerima pesanan.",
        "error"
      );
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout allowedRole="DRIVER">
        <div className="max-w-4xl mx-auto p-8 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-rf-blue/20 border-t-rf-blue rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-rf-text">
            Memuat rincian pesanan...
          </p>
        </div>
      </AppLayout>
    );
  }

  if (!order) {
    return (
      <AppLayout allowedRole="DRIVER">
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-rf-navy">
            {loadError ? "Pesanan Tidak Dapat Dimuat" : "Pesanan Tidak Ditemukan"}
          </h2>
          {loadError && (
            <p role="alert" className="text-sm text-rose-700">
              {loadError}
            </p>
          )}
          <TactileButton variant="primary" onClick={() => router.push("/driver/orders")}>
            Kembali ke Radar Pesanan
          </TactileButton>
        </div>
      </AppLayout>
    );
  }

  const isMotor = order.vehicleType === "MOTOR";
  const isAvailable = order.status === "PENDING";

  return (
    <AppLayout allowedRole="DRIVER">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-rf bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center shadow-tactile-btn-secondary"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-rf-navy">
                {order.status === "PENDING"
                  ? "Detail Pesanan Masuk"
                  : "Detail Perjalanan"}
              </h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              ID: {order.id} • Dibuat: {formatDateTime(order.createdAt)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <div className="md:col-span-7 space-y-4">
            <SurfaceCard className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-700">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-rf-text">
                      {order.customerName || "Informasi penumpang belum tersedia"}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {order.customerName
                        ? "Penumpang RideFlow"
                        : "Data penumpang tidak tersedia"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 font-bold uppercase block">
                    {order.finalFare !== undefined
                      ? "Tarif Final"
                      : "Estimasi Tarif"}
                  </span>
                  <span className="text-lg font-black text-emerald-700">
                    {formatIDR(order.finalFare ?? order.estimatedFare)}
                  </span>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">
                      Titik Jemput
                    </span>
                    <p className="font-bold text-rf-text text-sm">{order.pickup.name}</p>
                    <p className="text-slate-500">{order.pickup.address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 pt-2 border-t border-slate-100">
                  <Navigation className="w-4 h-4 text-rf-blue rotate-45 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">
                      Tujuan
                    </span>
                    <p className="font-bold text-rf-text text-sm">{order.destination.name}</p>
                    <p className="text-slate-500">{order.destination.address}</p>
                  </div>
                </div>

                {order.tripNotes && (
                  <div className="p-3 bg-slate-50 rounded-rf-sm border border-slate-200 mt-2">
                    <span className="font-bold text-slate-500">Catatan Penumpang:</span>
                    <p className="italic text-slate-700 mt-0.5">&ldquo;{order.tripNotes}&rdquo;</p>
                  </div>
                )}
              </div>

              {isAvailable ? (
                <div className="pt-3 border-t border-slate-100">
                  <TactileButton
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={handleAccept}
                    isLoading={isAccepting}
                    icon={<CheckCircle className="w-5 h-5" />}
                  >
                    Terima Pesanan Ini Sekarang
                  </TactileButton>
                </div>
              ) : (
                <div className="p-3 bg-slate-100 rounded-rf text-center text-xs text-slate-500 font-medium">
                  Pesanan ini sudah {order.status === "COMPLETED" ? "selesai" : "diproses"}.
                </div>
              )}
            </SurfaceCard>
          </div>

          <div className="md:col-span-5 space-y-4">
            <RouteMap
              pickup={order.pickup}
              destination={order.destination}
              routeGeometry={order.routeGeometry}
              className="h-56"
            />
            <SurfaceCard className="grid grid-cols-2 gap-3 p-4 text-center text-xs">
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400">
                  Jarak Rute
                </span>
                <span className="font-bold text-rf-navy">
                  {order.estimatedDistanceKm === null
                    ? "Belum tersedia"
                    : `${order.estimatedDistanceKm.toFixed(1)} km`}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase text-slate-400">
                  Estimasi Waktu
                </span>
                <span className="font-bold text-rf-navy">
                  {order.estimatedDurationMin === null
                    ? "Belum tersedia"
                    : `± ${order.estimatedDurationMin} menit`}
                </span>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
