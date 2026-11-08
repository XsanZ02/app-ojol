"use client";

import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { InsetInput } from "@/components/ui/InsetInput";
import { RouteMap } from "@/components/booking/RouteMap";
import { LocationAutocomplete } from "@/components/booking/LocationAutocomplete";
import { bookingsApi, routesApi } from "@/lib/api";
import { LocationPoint, RouteEstimate, VehicleType } from "@/types/booking";
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

function findPresetLocation(address: string | null, fallbackAddress: string) {
  const requested = address || fallbackAddress;
  return MOCK_LOCATIONS.find(
    (location) => location.name === requested || location.address === requested
  ) ?? null;
}

function NewBookingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [pickupLocation, setPickupLocation] = useState<LocationPoint | null>(() =>
    findPresetLocation(searchParams.get("pickup"), "Jl. Tukad Barito Timur (Panjer)")
  );
  const [destLocation, setDestLocation] = useState<LocationPoint | null>(() =>
    findPresetLocation(searchParams.get("destination"), "Pantai Sanur (Matahari Terbit)")
  );
  const [tripNotes, setTripNotes] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("MOTOR");
  const [isLoading, setIsLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"pickup" | "destination" | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<RouteEstimate[]>([]);
  const [searchFocusPoint, setSearchFocusPoint] = useState<LocationPoint | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<Pick<LocationPoint, "lat" | "lng"> | null>(null);
  const [mapCenter, setMapCenter] = useState<Pick<LocationPoint, "lat" | "lng"> | null>(null);
  const [deviceLocationStatus, setDeviceLocationStatus] =
    useState<"idle" | "requesting" | "available" | "denied" | "unavailable" | "timeout" | "error">("idle");
  const deviceLocationRequested = useRef(false);
  useEffect(() => {
    let cancelled = false;
    if (!pickupLocation || !destLocation) {
      setEstimates([]);
      setEstimateError(null);
      setIsEstimating(false);
      return;
    }

    setEstimates([]);
    setEstimateError(null);
    setIsEstimating(true);
    const timer = window.setTimeout(async () => {
      const results = await Promise.allSettled(
        (["MOTOR", "MOBIL"] as VehicleType[]).map((type) =>
          routesApi.estimate({
            pickupLatitude: pickupLocation.lat,
            pickupLongitude: pickupLocation.lng,
            destinationLatitude: destLocation.lat,
            destinationLongitude: destLocation.lng,
            vehicleType: type,
          })
        )
      );
      if (cancelled) return;
      const successful = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      setEstimates(successful);
      if (successful.length < results.length) {
        const failure = results.find((result) => result.status === "rejected");
        setEstimateError(
          successful.length === 0 &&
            failure?.status === "rejected" &&
            failure.reason instanceof Error
            ? failure.reason.message
            : "Sebagian rute kendaraan tidak tersedia. Pilih opsi dengan estimasi yang berhasil."
        );
      }
      setIsEstimating(false);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      cancelled = true;
    };
  }, [pickupLocation, destLocation]);

  const selectedEstimate = estimates.find((e) => e.vehicleType === vehicleType);
  const displayPickup = pickupLocation?.address || "Pilih titik jemput di peta";
  const displayDestination = destLocation?.address || "Pilih tujuan di peta";
  const searchBias = deviceLocation ?? mapCenter ?? pickupLocation;

  const requestDeviceLocation = useCallback(() => {
    if (deviceLocationRequested.current) return;
    deviceLocationRequested.current = true;
    if (!navigator.geolocation) {
      setDeviceLocationStatus("unavailable");
      return;
    }

    setDeviceLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDeviceLocation({ lat: coords.latitude, lng: coords.longitude });
        setDeviceLocationStatus("available");
      },
      (error) => {
        setDeviceLocationStatus(
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.POSITION_UNAVAILABLE
              ? "unavailable"
              : error.code === error.TIMEOUT
                ? "timeout"
                : "error"
        );
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 }
    );
  }, []);

  const handleMapCenterChange = useCallback(
    (center: Pick<LocationPoint, "lat" | "lng">) => setMapCenter(center),
    []
  );

  const locationHint =
    deviceLocationStatus === "requesting"
      ? "Mengambil lokasi perangkat untuk memprioritaskan hasil..."
      : deviceLocationStatus === "available"
        ? "Hasil pencarian diprioritaskan di sekitar lokasi perangkat."
        : deviceLocationStatus === "denied"
          ? "Izin lokasi ditolak. Pencarian menggunakan area peta."
          : deviceLocationStatus === "timeout"
            ? "Lokasi perangkat tidak merespons. Pencarian menggunakan area peta."
            : deviceLocationStatus === "unavailable" || deviceLocationStatus === "error"
              ? "Lokasi perangkat tidak tersedia. Pencarian menggunakan area peta."
              : null;

  const handleMapSelect = useCallback(
    (mode: "pickup" | "destination", point: LocationPoint) => {
      const selectedPoint = { ...point };
      if (mode === "pickup") setPickupLocation(selectedPoint);
      else {
        setDestLocation(selectedPoint);
        setSearchFocusPoint(null);
      }
      setEstimates([]);
      setSelectionMode(null);
    },
    []
  );

  const handleSearchSelect = useCallback((point: LocationPoint) => {
    setDestLocation(point);
    setSearchFocusPoint(point);
    setSelectionMode(null);
    setEstimates([]);
  }, []);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast("Browser ini tidak mendukung akses lokasi.", "error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const searchLocation = { lat: coords.latitude, lng: coords.longitude };
        setDeviceLocation(searchLocation);
        setDeviceLocationStatus("available");
        deviceLocationRequested.current = true;
        const point: LocationPoint = {
          address: `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
          name: "Lokasi saya",
          lat: coords.latitude,
          lng: coords.longitude,
        };
        if (selectionMode === "destination") {
          setDestLocation(point);
          setSearchFocusPoint(null);
        } else {
          setPickupLocation(point);
        }
        setEstimates([]);
        setSelectionMode(null);
      },
      () => showToast("Lokasi perangkat tidak dapat diakses.", "error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirmBooking = async () => {
    if (!pickupLocation || !destLocation) {
      showToast("Pilih titik jemput dan tujuan pada peta.", "error");
      return;
    }
    if (!selectedEstimate) {
      showToast(estimateError || "Menunggu estimasi rute yang valid.", "error");
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
        tripNotes: tripNotes.trim() || undefined,
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
        <div className="relative z-20 md:col-span-7 space-y-4">
          {/* Route Summary Card */}
          <SurfaceCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Rute Perjalanan
              </span>
              <button
                type="button"
                onClick={() => setSelectionMode(selectionMode ? null : "pickup")}
                className="text-xs font-bold text-rf-blue hover:underline"
              >
                {selectionMode ? "Selesai Memilih" : "Ubah Lokasi"}
              </button>
            </div>

            {selectionMode && (
              <div className="flex flex-wrap gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectionMode("pickup")}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold",
                    selectionMode === "pickup"
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  Pilih titik jemput
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionMode("destination")}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold",
                    selectionMode === "destination"
                      ? "border-rf-blue bg-blue-50 text-rf-blue"
                      : "border-slate-200 bg-white text-slate-600"
                  )}
                >
                  Pilih tujuan
                </button>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Gunakan lokasi saya
                </button>
                <p className="w-full text-xs text-slate-500">
                  Klik peta untuk memilih atau seret marker untuk memindahkan lokasi.
                </p>
              </div>
            )}

            <div className="py-3 space-y-3">
                <LocationAutocomplete
                  value={
                    destLocation?.address ??
                    searchParams.get("destination") ??
                    ""
                  }
                  bias={searchBias}
                  locationHint={locationHint ?? undefined}
                  onSearchFocus={requestDeviceLocation}
                  onSelect={handleSearchSelect}
                />
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200 shadow-sm mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold uppercase">
                      Titik Jemput
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectionMode("pickup")}
                      aria-label={`Ubah titik jemput: ${displayPickup}`}
                      aria-pressed={selectionMode === "pickup"}
                      className={cn(
                        "block max-w-full cursor-pointer text-left text-sm font-bold text-rf-text rounded-sm underline-offset-2",
                        "hover:text-rf-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rf-blue",
                        selectionMode === "pickup" && "text-rf-blue"
                      )}
                    >
                      {displayPickup}
                    </button>
                    {pickupLocation && (
                      <p className="text-xs text-slate-500">
                        {pickupLocation.lat.toFixed(6)}, {pickupLocation.lng.toFixed(6)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-rf-navy text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                    <Navigation className="w-3.5 h-3.5 rotate-45" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold uppercase">
                      Tujuan
                    </p>
                    <p className="max-w-full break-words text-sm font-bold text-rf-text">
                      {displayDestination}
                    </p>
                    {destLocation && (
                      <p className="text-xs text-slate-500">
                        {destLocation.lat.toFixed(6)}, {destLocation.lng.toFixed(6)}
                      </p>
                    )}
                  </div>
                </div>
            </div>

            {/* Trip Notes Input */}
            <div className="pt-3 border-t border-slate-100">
              <InsetInput
                label="Catatan untuk Pengemudi (Opsional)"
                value={tripNotes}
                onChange={(e) => setTripNotes(e.target.value)}
                maxLength={500}
                placeholder="Contoh: Depan lobi barat dekat satpam, bawa payung..."
                leftIcon={<FileText className="w-4 h-4" />}
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Catatan ini akan diteruskan ke pengemudi (maksimal 500 karakter).
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
                            {isMotor ? "RideFlow Motor" : "RideFlow Mobil"}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            ~{Math.ceil(est.durationSeconds / 60)} menit
                          </span>
                        </div>
                        <p className="text-xs text-rf-text-secondary mt-0.5">
                          {isMotor
                            ? "Sepeda motor mengikuti jaringan jalan yang tersedia"
                            : "Mobil mengikuti rute jalan yang tersedia"}
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

        {/* Right Column: OpenStreetMap & Final Confirmation */}
        <div className="relative z-0 md:col-span-5 space-y-4">
          <RouteMap
            pickup={pickupLocation}
            destination={destLocation}
            routeGeometry={selectedEstimate?.routeGeometry}
            selectionMode={selectionMode}
            onSelectLocation={handleMapSelect}
            focusPoint={searchFocusPoint}
            onMapCenterChange={handleMapCenterChange}
            className="h-48"
          />
          {isEstimating && (
          <p className="text-center text-xs font-medium text-slate-500">
            Menghitung rute jalan dan tarif dari server...
          </p>
          )}
          {estimateError && (
          <p role="alert" className="rounded-rf bg-rose-50 p-3 text-xs text-rose-700">
            {estimateError}
          </p>
          )}

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
                    {selectedEstimate.distanceKm.toFixed(1)} km
                  </span>
                </div>
                <div className="flex justify-between text-rf-text-secondary">
                  <span>Waktu Perjalanan:</span>
                  <span className="font-bold text-rf-text">
                    ± {Math.ceil(selectedEstimate.durationSeconds / 60)} menit
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
                    : "—"}
                </span>
              </div>
            </div>

            <TactileButton
              size="lg"
              className="w-full mt-4"
              onClick={handleConfirmBooking}
              isLoading={isLoading}
              disabled={!selectedEstimate || isEstimating}
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
