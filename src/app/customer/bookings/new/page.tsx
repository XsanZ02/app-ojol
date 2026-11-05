"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { InsetInput } from "@/components/ui/InsetInput";
import { IllustrativeMap } from "@/components/booking/IllustrativeMap";
import { FareService } from "@/lib/fare-service";
import { bookingsApi } from "@/lib/api";
import { LocationPoint, VehicleType, FareEstimate } from "@/types/booking";
import { MOCK_LOCATIONS } from "@/lib/mock-data";
import { formatIDR } from "@/lib/utils";
import { useToast } from "@/components/ui/ToastNotification";
import {
  Bike,
  Car,
  MapPin,
  Navigation,
  FileText,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowLeft,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

function NewBookingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [pickupAddress, setPickupAddress] = useState(
    searchParams.get("pickup") || "Jl. Tukad Barito Timur (Panjer)"
  );
  const [destAddress, setDestAddress] = useState(
    searchParams.get("destination") || "Pantai Sanur (Matahari Terbit)"
  );
  const [tripNotes, setTripNotes] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("MOTOR");
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingRoute, setIsEditingRoute] = useState(false);

  const pickupLocation = useMemo<LocationPoint | null>(
    () =>
      MOCK_LOCATIONS.find(
        (location) =>
          location.name === pickupAddress || location.address === pickupAddress
      ) || null,
    [pickupAddress]
  );

  const destLocation = useMemo<LocationPoint | null>(
    () =>
      MOCK_LOCATIONS.find(
        (location) =>
          location.name === destAddress || location.address === destAddress
      ) || null,
    [destAddress]
  );

  const [estimates, setEstimates] = useState<FareEstimate[]>([]);

  useEffect(() => {
    if (pickupLocation && destLocation) {
      const allEstimates = FareService.getAllEstimates(
        pickupLocation,
        destLocation
      );
      setEstimates(allEstimates);
    } else {
      setEstimates([]);
    }
  }, [pickupLocation, destLocation]);

  const selectedEstimate = estimates.find((e) => e.vehicleType === vehicleType);

  const handleConfirmBooking = async () => {
    if (!pickupAddress || !destAddress) {
      showToast("Lengkapi titik jemput dan tujuan.", "error");
      return;
    }
    if (!pickupLocation || !destLocation) {
      showToast(
        "Pilih titik jemput dan tujuan yang tersedia agar koordinat perjalanan valid.",
        "error"
      );
      return;
    }
    if (tripNotes.trim()) {
      showToast(
        "Catatan perjalanan belum didukung oleh backend dan tidak dapat disimpan.",
        "error"
      );
      return;
    }

    setIsLoading(true);
    try {
      const newBooking = await bookingsApi.create({
        pickupAddress: pickupLocation.address,
        pickupLatitude: pickupLocation.lat,
        pickupLongitude: pickupLocation.lng,
        destinationAddress: destLocation.address,
        destinationLatitude: destLocation.lat,
        destinationLongitude: destLocation.lng,
        vehicleType,
      });

      showToast("Pesanan berhasil dibuat! Mencari pengemudi...", "success");
      router.push(`/customer/trips/${newBooking.id}`);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Gagal membuat pesanan.",
        "error"
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back and Page Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-rf bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center shadow-tactile-btn-secondary transition-transform active:scale-95"
          aria-label="Kembali"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-rf-navy">
            Konfirmasi Pemesanan Perjalanan
          </h1>
          <p className="text-xs text-rf-text-secondary">
            Periksa rute, pilih jenis kendaraan, dan konfirmasi pesanan Anda
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Column: Route & Options */}
        <div className="md:col-span-7 space-y-4">
          {/* Route Summary Card */}
          <SurfaceCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Rute Perjalanan
              </span>
              <button
                type="button"
                onClick={() => setIsEditingRoute(!isEditingRoute)}
                className="text-xs font-bold text-rf-blue hover:underline"
              >
                {isEditingRoute ? "Selesai Mengubah" : "Ubah Lokasi"}
              </button>
            </div>

            {isEditingRoute ? (
              <div className="pt-3 space-y-3">
                <InsetInput
                  label="Titik Jemput"
                  value={pickupAddress}
                  onChange={(e) => setPickupAddress(e.target.value)}
                  leftIcon={<MapPin className="w-4 h-4 text-emerald-600" />}
                />
                <InsetInput
                  label="Tujuan"
                  value={destAddress}
                  onChange={(e) => setDestAddress(e.target.value)}
                  leftIcon={<Navigation className="w-4 h-4 text-rf-blue rotate-45" />}
                />
              </div>
            ) : (
              <div className="py-3 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200 shadow-sm mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-semibold uppercase">
                      Titik Jemput
                    </p>
                    <p className="text-sm font-bold text-rf-text">
                      {pickupAddress}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-rf-navy text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Navigation className="w-3.5 h-3.5 rotate-45" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-semibold uppercase">
                      Tujuan
                    </p>
                    <p className="text-sm font-bold text-rf-text">
                      {destAddress}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Trip Notes Input */}
            <div className="pt-3 border-t border-slate-100">
              <InsetInput
                label="Catatan untuk Pengemudi (Opsional)"
                value={tripNotes}
                onChange={(e) => setTripNotes(e.target.value)}
                placeholder="Contoh: Depan lobi barat dekat satpam, bawa payung..."
                leftIcon={<FileText className="w-4 h-4" />}
              />
              <p className="mt-1 text-[11px] text-slate-500">
              Catatan belum dapat disimpan pada perjalanan backend.
              </p>
            </div>
          </SurfaceCard>

          {/* Vehicle Selection (Tactile Cards) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-rf-text-secondary">
              Pilih Jenis Kendaraan
            </label>

            <div className="grid grid-cols-1 gap-3">
              {estimates.map((est) => {
                const isSelected = est.vehicleType === vehicleType;
                const isMotor = est.vehicleType === "MOTOR";

                return (
                  <div
                    key={est.vehicleType}
                    onClick={() => setVehicleType(est.vehicleType)}
                    className={cn(
                      "p-4 rounded-rf border transition-all cursor-pointer flex items-center justify-between",
                      isSelected
                        ? "bg-blue-50/70 border-rf-blue shadow-tactile-card ring-2 ring-blue-500/20"
                        : "bg-white border-slate-200 hover:bg-slate-50 shadow-sm"
                    )}
                  >
                    <div className="flex items-center gap-3.5">
                      <div
                        className={cn(
                          "w-12 h-12 rounded-rf flex items-center justify-center shadow-tactile-btn shrink-0",
                          isSelected
                            ? "bg-rf-blue text-white"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        )}
                      >
                        {isMotor ? (
                          <Bike className="w-6 h-6" />
                        ) : (
                          <Car className="w-6 h-6" />
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-rf-text">
                            {est.vehicleLabel}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            ~{est.durationMin} menit
                          </span>
                        </div>
                        <p className="text-xs text-rf-text-secondary mt-0.5">
                          {est.vehicleDescription}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-base font-extrabold text-rf-navy">
                        {formatIDR(est.estimatedFare)}
                      </span>
                      <span className="block text-[10px] text-slate-400 uppercase font-semibold">
                        Estimasi
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Illustrative Map & Final Confirmation */}
        <div className="md:col-span-5 space-y-4">
          <IllustrativeMap
            pickup={pickupLocation}
            destination={destLocation}
            className="h-48"
          />

          {/* Summary & Price Card */}
          <SurfaceCard className="p-5 space-y-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide">
              <Clock className="w-4 h-4 text-rf-blue" />
              <span>Rincian Estimasi Biaya</span>
            </div>

            {selectedEstimate && (
              <div className="space-y-2 text-xs border-b border-slate-100 pb-3">
                <div className="flex justify-between text-rf-text-secondary">
                  <span>Jarak Tempuh (Perkiraan):</span>
                  <span className="font-bold text-rf-text">
                    {selectedEstimate.distanceKm} km
                  </span>
                </div>
                <div className="flex justify-between text-rf-text-secondary">
                  <span>Waktu Perjalanan:</span>
                  <span className="font-bold text-rf-text">
                    ± {selectedEstimate.durationMin} menit
                  </span>
                </div>
                <div className="flex justify-between text-rf-text-secondary">
                  <span>Tarif Dasar:</span>
                  <span className="font-semibold text-rf-text">
                    {formatIDR(selectedEstimate.baseFare)}
                  </span>
                </div>
                <div className="flex justify-between text-rf-text-secondary">
                  <span>Tarif / km:</span>
                  <span className="font-semibold text-rf-text">
                    {formatIDR(selectedEstimate.ratePerKm)}/km
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-xs text-slate-500 font-bold uppercase">
                  Total Estimasi Tarif
                </span>
                <div className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                  <Info className="w-3.5 h-3.5" />
                  <span>Tarif final dihitung backend</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-rf-blue">
                  {selectedEstimate
                    ? formatIDR(selectedEstimate.estimatedFare)
                    : "Rp0"}
                </span>
              </div>
            </div>

            <TactileButton
              size="lg"
              className="w-full mt-4"
              onClick={handleConfirmBooking}
              isLoading={isLoading}
              icon={<CheckCircle2 className="w-5 h-5" />}
            >
              Konfirmasi & Pesan Perjalanan
            </TactileButton>

            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
              Dengan mengonfirmasi, pengemudi RideFlow terdekat di sekitar Denpasar akan diberitahukan mengenai pesanan Anda.
            </p>
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <AppLayout allowedRole="CUSTOMER">
      <Suspense
        fallback={
          <div className="max-w-4xl mx-auto p-12 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-rf-blue/20 border-t-rf-blue rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-rf-text">
              Menyiapkan kalkulator perjalanan...
            </p>
          </div>
        }
      >
        <NewBookingContent />
      </Suspense>
    </AppLayout>
  );
}
