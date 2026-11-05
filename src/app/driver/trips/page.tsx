"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { BookingCard } from "@/components/booking/BookingCard";
import { InsetInput } from "@/components/ui/InsetInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { driverApi } from "@/lib/api";
import { Booking } from "@/types/booking";
import { Search, History, TrendingUp } from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function DriverTripHistoryPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Booking[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const data = await driverApi.getMyBookings();
        setTrips(data);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Riwayat perjalanan tidak dapat dimuat."
        );
      } finally {
        setIsLoading(false);
      }
    };
    fetchTrips();
  }, [user]);

  const filteredTrips = trips.filter((t) => {
    const matchesSearch =
      t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.pickup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.destination.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === "ALL") return true;
    return t.status === statusFilter;
  });

  const totalCompletedFare = trips
    .filter((t) => t.status === "COMPLETED")
    .reduce((acc, t) => acc + (t.finalFare ?? 0), 0);

  const filterTabs = [
    { id: "ALL", label: "Semua Tarikan" },
    { id: "COMPLETED", label: "Selesai" },
    { id: "CANCELLED", label: "Dibatalkan" },
  ];

  return (
    <AppLayout allowedRole="DRIVER">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-extrabold text-rf-navy">
              Riwayat Tarikan Pengemudi
            </h1>
            <p className="text-xs text-rf-text-secondary mt-0.5">
              Daftar rekam jejak seluruh order yang pernah Anda selesaikan
            </p>
          </div>

          <div className="flex items-center gap-2 p-2.5 bg-emerald-50 rounded-rf border border-emerald-200 text-xs">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-600">Total Akumulasi:</span>
            <span className="font-bold text-emerald-800">
              {formatIDR(totalCompletedFare)}
            </span>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="space-y-3">
          <InsetInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan nama penumpang, lokasi, atau ID order..."
            leftIcon={<Search className="w-4 h-4" />}
          />

          <div className="flex flex-wrap gap-2 pt-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all select-none min-h-[36px]",
                  statusFilter === tab.id
                    ? "bg-rf-blue text-white border-rf-blue shadow-tactile-btn"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trip Cards */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="tactile-card p-6 h-40 animate-pulse bg-slate-100" />
            <div className="tactile-card p-6 h-40 animate-pulse bg-slate-100" />
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-rf border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {loadError}
          </div>
        ) : filteredTrips.length === 0 ? (
          <EmptyState
            icon={<History className="w-6 h-6" />}
            title="Tidak Ada Riwayat Tarikan"
            description="Belum ada riwayat pesanan yang sesuai dengan filter atau Anda belum menyelesaikan tarikan baru hari ini."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTrips.map((trip) => (
              <BookingCard
                key={trip.id}
                booking={trip}
                role="DRIVER"
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
