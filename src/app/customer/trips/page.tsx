"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { BookingCard } from "@/components/booking/BookingCard";
import { InsetInput } from "@/components/ui/InsetInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { bookingsApi } from "@/lib/api";
import { Booking, BookingStatus } from "@/types/booking";
import { Search, Filter, History, Calendar, Plus } from "lucide-react";
import { TactileButton } from "@/components/ui/TactileButton";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function CustomerTripHistoryPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const data = await bookingsApi.getMyBookings();
        setBookings(data);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Riwayat perjalanan tidak dapat dimuat."
        );
      } finally {
        setIsLoading(false);
      }
    };
    fetchTrips();
  }, []);

  // Filter criteria
  const filteredBookings = bookings.filter((b) => {
    const matchesSearch =
      b.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.pickup.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.destination.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.pickup.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.destination.address.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === "ALL") return true;
    if (statusFilter === "ACTIVE") {
      return (
        b.status === "PENDING" ||
        b.status === "ACCEPTED" ||
        b.status === "PICKING_UP" ||
        b.status === "IN_PROGRESS"
      );
    }
    return b.status === statusFilter;
  });

  const filterTabs = [
    { id: "ALL", label: "Semua Pesanan" },
    { id: "ACTIVE", label: "Sedang Berjalan" },
    { id: "COMPLETED", label: "Selesai" },
    { id: "CANCELLED", label: "Dibatalkan" },
  ];

  return (
    <AppLayout allowedRole="CUSTOMER">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-extrabold text-rf-navy">
              Riwayat Perjalanan
            </h1>
            <p className="text-xs text-rf-text-secondary mt-0.5">
              Daftar seluruh perjalanan RideFlow yang pernah Anda pesan
            </p>
          </div>

          <Link href="/customer/bookings/new">
            <TactileButton
              variant="primary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
            >
              Pesan Baru
            </TactileButton>
          </Link>
        </div>

        {/* Filter & Search Bar */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <InsetInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari berdasarkan lokasi jemput, tujuan, atau ID pesanan..."
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
          </div>

          {/* Filter Pills */}
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

        {/* Booking Cards Grid / List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="tactile-card p-6 h-40 animate-pulse bg-slate-100" />
            <div className="tactile-card p-6 h-40 animate-pulse bg-slate-100" />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="rounded-rf border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            {loadError}
          </div>
        ) : filteredBookings.length === 0 ? (
          <EmptyState
            icon={<History className="w-6 h-6" />}
            title="Tidak Ada Riwayat yang Sesuai"
            description={
              searchQuery || statusFilter !== "ALL"
                ? "Tidak ada pesanan yang sesuai dengan kata kunci atau filter yang Anda pilih."
                : "Anda belum memiliki riwayat perjalanan di RideFlow."
            }
            actionLabel="Pesan Perjalanan Sekarang"
            onAction={() => (window.location.href = "/customer/bookings/new")}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredBookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                role="CUSTOMER"
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
