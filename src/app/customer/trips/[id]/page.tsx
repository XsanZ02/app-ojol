"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TripTimeline } from "@/components/trip/TripTimeline";
import { IllustrativeMap } from "@/components/booking/IllustrativeMap";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { bookingsApi } from "@/lib/api";
import { Booking } from "@/types/booking";
import { formatDateTime, formatIDR, getStatusLabel } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastNotification";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  Star,
  Phone,
  Shield,
  Bike,
  Car,
  Clock,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

export default function CustomerTripDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const bookingId = params.id as string;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchTrip = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await bookingsApi.getById(bookingId);
      setBooking(data);
    } catch (error) {
      setBooking(null);
      setLoadError(
        error instanceof Error ? error.message : "Perjalanan tidak dapat dimuat."
      );
    } finally {
      setIsLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const handleCancelBooking = async () => {
    if (!booking) return;
    setIsCancelling(true);
    try {
      const updatedBooking = await bookingsApi.cancel(
        booking.id,
        "Dibatalkan oleh penumpang."
      );
      setBooking(updatedBooking);
      showToast("Pesanan berhasil dibatalkan.", "info");
      setShowCancelDialog(false);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Gagal membatalkan pesanan.",
        "error"
      );
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout allowedRole="CUSTOMER">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="tactile-card p-8 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-rf-blue/20 border-t-rf-blue rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-rf-text">
              Memuat detail perjalanan {bookingId}...
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!booking) {
    return (
      <AppLayout allowedRole="CUSTOMER">
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-rf-navy">
            {loadError ? "Perjalanan Tidak Dapat Dimuat" : "Pesanan Tidak Ditemukan"}
          </h2>
          <p className="text-sm text-rf-text-secondary">
            {loadError || `ID perjalanan ${bookingId} tidak ditemukan di sistem.`}
          </p>
          {loadError && (
            <TactileButton
              variant="secondary"
              onClick={() => {
                setIsLoading(true);
                fetchTrip();
              }}
            >
              Coba Lagi
            </TactileButton>
          )}
          <TactileButton variant="primary" onClick={() => router.push("/customer/dashboard")}>
            Kembali ke Dashboard
          </TactileButton>
        </div>
      </AppLayout>
    );
  }

  const isMotor = booking.vehicleType === "MOTOR";
  const canCancel = booking.status === "PENDING";

  return (
    <AppLayout allowedRole="CUSTOMER">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/customer/trips")}
              className="w-10 h-10 rounded-rf bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center shadow-tactile-btn-secondary"
              aria-label="Kembali ke riwayat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-rf-navy">
                  Detail Perjalanan
                </h1>
                <StatusBadge status={booking.status} />
              </div>
              <p className="text-xs font-mono text-slate-500 mt-0.5">
                ID: {booking.id} • Dibuat: {formatDateTime(booking.createdAt)}
              </p>
            </div>
          </div>

          {canCancel && (
            <TactileButton
              variant="danger"
              size="sm"
              onClick={() => setShowCancelDialog(true)}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Batalkan Pesanan
            </TactileButton>
          )}
        </div>

        {/* Status Callout Banner */}
        <div className="p-4 rounded-rf bg-blue-50/70 border border-blue-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-rf-blue animate-ping shrink-0" />
            <div>
              <span className="text-xs font-bold text-rf-navy uppercase tracking-wider">
                Status Saat Ini:
              </span>
              <p className="text-sm font-bold text-rf-blue">
                {getStatusLabel(booking.status)}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-500 font-semibold uppercase">
              Total Tarif
            </span>
            <p className="text-lg font-extrabold text-rf-navy">
              {formatIDR(booking.estimatedFare)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Progress Timeline & Driver Profile */}
          <div className="md:col-span-7 space-y-5">
            {/* Driver Profile Card (when driver has accepted) */}
            {booking.driverName ? (
              <SurfaceCard className="p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
                  <span>Informasi Mitra Pengemudi</span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" /> Terverifikasi
                  </span>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full bg-slate-200 border-2 border-rf-blue overflow-hidden flex items-center justify-center shrink-0 shadow-tactile-btn">
                    <img
                      src="https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80"
                      alt={booking.driverName}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-rf-navy">
                        {booking.driverName}
                      </h3>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs font-bold text-amber-700">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span>{booking.driverRating ?? "—"}</span>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 bg-slate-50 rounded-rf-sm border border-slate-200">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Kendaraan
                        </span>
                        <span className="font-semibold text-rf-text">
                          {booking.vehicleModel || "Belum tersedia"}
                        </span>
                      </div>

                      <div className="p-2 bg-slate-50 rounded-rf-sm border border-slate-200">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">
                          Plat Nomor
                        </span>
                        <span className="font-bold font-mono text-rf-blue">
                          {booking.vehiclePlate || "Belum tersedia"}
                        </span>
                      </div>
                    </div>

                    {booking.driverPhone && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-rf-text font-medium">
                        <Phone className="w-4 h-4 text-emerald-600" />
                        <span>{booking.driverPhone}</span>
                      </div>
                    )}
                  </div>
                </div>
              </SurfaceCard>
            ) : (
              <SurfaceCard className="p-5 text-center py-8">
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-3 animate-pulse">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-rf-navy">
                  Sedang Menghubungi Mitra Pengemudi...
                </h3>
                <p className="text-xs text-rf-text-secondary max-w-sm mx-auto mt-1 leading-relaxed">
                  Permintaan Anda telah disiarkan ke pengemudi {isMotor ? "sepeda motor" : "mobil"} di sekitar area penjemputan Anda di Bali.
                </p>
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>Sistem Dispatch Siaga</span>
                </div>
              </SurfaceCard>
            )}

            {/* Trip Timeline Card */}
            <SurfaceCard className="p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
                Progres Perjalanan
              </h3>
              <TripTimeline
                status={booking.status}
                statusHistory={booking.statusHistory}
              />
            </SurfaceCard>
          </div>

          {/* Right Column: Route Details & Illustrative Map */}
          <div className="md:col-span-5 space-y-4">
            <IllustrativeMap
              pickup={booking.pickup}
              destination={booking.destination}
              className="h-48"
            />

            <SurfaceCard className="p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Informasi Rute & Catatan
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">
                      Lokasi Penjemputan
                    </span>
                    <p className="font-bold text-rf-text text-sm">
                      {booking.pickup.name}
                    </p>
                    <p className="text-slate-500">{booking.pickup.address}</p>
                    {booking.pickup.notes && (
                      <p className="text-amber-700 font-medium mt-0.5">
                        Catatan: {booking.pickup.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-2.5 pt-2 border-t border-slate-100">
                  <Navigation className="w-4 h-4 text-rf-blue rotate-45 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-400 uppercase text-[10px]">
                      Lokasi Tujuan
                    </span>
                    <p className="font-bold text-rf-text text-sm">
                      {booking.destination.name}
                    </p>
                    <p className="text-slate-500">
                      {booking.destination.address}
                    </p>
                  </div>
                </div>

                {booking.tripNotes && (
                  <div className="pt-2 border-t border-slate-100">
                    <span className="font-bold text-slate-400 uppercase text-[10px]">
                      Catatan Perjalanan Anda
                    </span>
                    <p className="text-slate-700 italic mt-0.5 bg-slate-50 p-2 rounded-rf-sm border border-slate-200">
                      &ldquo;{booking.tripNotes}&rdquo;
                    </p>
                  </div>
                )}
              </div>

              {/* Vehicle & Distance Summary */}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2 bg-slate-50 rounded-rf-sm">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">
                    Jarak Tempuh
                  </span>
                  <span className="font-bold text-rf-navy">
                    {booking.estimatedDistanceKm} km
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded-rf-sm">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">
                    Jenis Layanan
                  </span>
                  <span className="font-bold text-rf-blue">
                    {isMotor ? "RideFlow Motor" : "RideFlow Mobil"}
                  </span>
                </div>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Cancellation */}
      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Batalkan Pesanan Ini?"
        description="Apakah Anda yakin ingin membatalkan pesanan perjalanan ini? Aksi ini tidak dapat diurungkan."
        confirmLabel="Ya, Batalkan Pesanan"
        cancelLabel="Kembali"
        variant="danger"
        isLoading={isCancelling}
        onConfirm={handleCancelBooking}
        onClose={() => setShowCancelDialog(false)}
      />
    </AppLayout>
  );
}
