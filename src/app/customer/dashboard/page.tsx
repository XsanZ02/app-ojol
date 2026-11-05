"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { TactileButton } from "@/components/ui/TactileButton";
import { InsetInput } from "@/components/ui/InsetInput";
import { IllustrativeMap } from "@/components/booking/IllustrativeMap";
import { BookingCard } from "@/components/booking/BookingCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { MOCK_LOCATIONS } from "@/lib/mock-data";
import { bookingsApi } from "@/lib/api";
import { Booking, LocationPoint } from "@/types/booking";
import {
  MapPin,
  Navigation,
  ArrowRight,
  Clock,
  Compass,
  AlertCircle,
  Plus,
  Bike,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function CustomerDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [pickupText, setPickupText] = useState(
    "Jl. Tukad Barito Timur (Panjer)"
  );
  const [destText, setDestText] = useState("Pantai Sanur (Matahari Terbit)");
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);

  // Find corresponding location points for illustrative map
  const pickupLocation: LocationPoint = MOCK_LOCATIONS.find(
    (l) => l.name === pickupText
  ) || {
    name: pickupText,
    address: pickupText,
    lat: -8.6834,
    lng: 115.2289,
    district: "Panjer",
  };

  const destLocation: LocationPoint = MOCK_LOCATIONS.find(
    (l) => l.name === destText
  ) || {
    name: destText,
    address: destText,
    lat: -8.6755,
    lng: 115.2635,
    district: "Sanur",
  };

  const fetchBookings = async () => {
    setIsLoadingBookings(true);
    try {
      const data = await bookingsApi.getMyBookings();
      setMyBookings(data);
    } catch {
      // Handled gracefully
    } finally {
      setIsLoadingBookings(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [user]);

  // Check if there is an ongoing active trip
  const activeBooking = myBookings.find(
    (b) =>
      b.status === "PENDING" ||
      b.status === "ACCEPTED" ||
      b.status === "PICKING_UP" ||
      b.status === "IN_PROGRESS"
  );

  const recentCompletedBookings = myBookings
    .filter((b) => b.status === "COMPLETED" || b.status === "CANCELLED")
    .slice(0, 3);

  const handleStartBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickupText || !destText) return;
    // Route to booking confirmation flow with query params
    const params = new URLSearchParams({
      pickup: pickupText,
      destination: destText,
    });
    router.push(`/customer/bookings/new?${params.toString()}`);
  };

  const setLocationPreset = (pickup: string, destination: string) => {
    setPickupText(pickup);
    setDestText(destination);
  };

  return (
    <AppLayout allowedRole="CUSTOMER">
      <div className="space-y-6 max-w-6xl mx-auto">
        {/* Top Greeting Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-rf-navy tracking-tight">
              Halo, {user?.name?.split(" ")[0] || "Penumpang"}! 👋
            </h1>
            <p className="text-sm text-rf-text-secondary mt-1">
              Siap bepergian hari ini? Layanan RideFlow Bali beroperasi normal.
            </p>
          </div>

          <Link href="/customer/bookings/new">
            <TactileButton
              variant="primary"
              size="md"
              icon={<Plus className="w-4 h-4" />}
            >
              Buat Pesanan Baru
            </TactileButton>
          </Link>
        </div>

        {/* Active Trip Banner if currently on a trip */}
        {activeBooking && (
          <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 to-rf-navy text-white rounded-rf-lg border border-blue-800 shadow-tactile-card flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-blue-500/30 border border-blue-400/40 flex items-center justify-center shrink-0">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/30 text-blue-200 uppercase tracking-wider mb-1">
                  <span>Trip Berlangsung: {activeBooking.id}</span>
                </div>
                <h3 className="text-base font-bold text-white">
                  Menuju {activeBooking.destination.name}
                </h3>
                <p className="text-xs text-blue-200 mt-0.5">
                  Status: {activeBooking.status} • Driver:{" "}
                  {activeBooking.driverName || "Mencari pengemudi..."}
                </p>
              </div>
            </div>

            <Link href={`/customer/trips/${activeBooking.id}`}>
              <TactileButton
                variant="secondary"
                size="sm"
                className="bg-white text-rf-navy hover:bg-slate-100 border-none shadow-md shrink-0 w-full sm:w-auto"
                icon={<ArrowRight className="w-4 h-4" />}
              >
                Pantau Perjalanan Ini
              </TactileButton>
            </Link>
          </div>
        )}

        {/* Main 2-Column Section: Hero Booking Form + Illustrative Map */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Hero Booking Control Panel */}
          <div className="lg:col-span-6 space-y-4">
            <SurfaceCard className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-rf bg-blue-50 text-rf-blue flex items-center justify-center border border-blue-200 shadow-[inset_0_1px_0_#ffffff]">
                  <Compass className="w-4 h-4" />
                </div>
                <h2 className="text-lg font-bold text-rf-navy">
                  Mau ke mana hari ini?
                </h2>
              </div>

              <form onSubmit={handleStartBooking} className="space-y-4">
                <InsetInput
                  label="Titik Penjemputan"
                  value={pickupText}
                  onChange={(e) => setPickupText(e.target.value)}
                  placeholder="Ketik lokasi jemput Anda..."
                  leftIcon={<MapPin className="w-4 h-4 text-emerald-600" />}
                  required
                />

                <InsetInput
                  label="Tujuan Perjalanan"
                  value={destText}
                  onChange={(e) => setDestText(e.target.value)}
                  placeholder="Ketik lokasi tujuan Anda..."
                  leftIcon={<Navigation className="w-4 h-4 text-rf-blue rotate-45" />}
                  required
                />

                {/* Quick Presets for Demo Reviewers */}
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Rute Populer di Denpasar & Sanur:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setLocationPreset(
                          "Jl. Tukad Barito Timur (Panjer)",
                          "Plaza Renon Denpasar"
                        )
                      }
                      className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-rf-blue border border-slate-200 rounded-full text-xs font-medium transition-colors"
                    >
                      Panjer → Plaza Renon
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLocationPreset(
                          "Lapangan Renon (Bajra Sandhi)",
                          "Pantai Sanur (Matahari Terbit)"
                        )
                      }
                      className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-rf-blue border border-slate-200 rounded-full text-xs font-medium transition-colors"
                    >
                      Renon → Pantai Sanur
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setLocationPreset(
                          "Universitas Udayana Kampus Sudirman",
                          "Level 21 Mall Teuku Umar"
                        )
                      }
                      className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-rf-blue border border-slate-200 rounded-full text-xs font-medium transition-colors"
                    >
                      Unud Sudirman → Level 21
                    </button>
                  </div>
                </div>

                <TactileButton
                  type="submit"
                  size="lg"
                  className="w-full mt-2"
                  icon={<ArrowRight className="w-4 h-4" />}
                >
                  Pesan Sekarang (Cek Tarif)
                </TactileButton>
              </form>
            </SurfaceCard>
          </div>

          {/* Illustrative Map Panel */}
          <div className="lg:col-span-6 flex flex-col">
            <IllustrativeMap
              pickup={pickupLocation}
              destination={destLocation}
              className="h-full min-h-[300px]"
            />
          </div>
        </div>

        {/* Recent Trip History Section */}
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-rf-blue" />
              <h2 className="text-base font-bold text-rf-navy">
                Riwayat Perjalanan Terbaru
              </h2>
            </div>
            <Link
              href="/customer/trips"
              className="text-xs font-bold text-rf-blue hover:underline"
            >
              Lihat Semua Riwayat
            </Link>
          </div>

          {isLoadingBookings ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="tactile-card p-5 h-36 animate-pulse bg-slate-100" />
              <div className="tactile-card p-5 h-36 animate-pulse bg-slate-100" />
            </div>
          ) : recentCompletedBookings.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-6 h-6" />}
              title="Belum Ada Riwayat Perjalanan"
              description="Perjalanan yang telah selesai atau dibatalkan akan dicatat otomatis di sini."
              actionLabel="Pesan Perjalanan Pertama"
              onAction={() => router.push("/customer/bookings/new")}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentCompletedBookings.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  role="CUSTOMER"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

