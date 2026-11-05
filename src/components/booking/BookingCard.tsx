import React from "react";
import { Booking } from "@/types/booking";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime, formatIDR } from "@/lib/utils";
import { MapPin, Navigation, Bike, Car, ChevronRight, User } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface BookingCardProps {
  booking: Booking;
  role?: "CUSTOMER" | "DRIVER";
  className?: string;
  onSelect?: () => void;
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking,
  role = "CUSTOMER",
  className,
  onSelect,
}) => {
  const isMotor = booking.vehicleType === "MOTOR";
  const displayedFare =
    role === "DRIVER" ? booking.finalFare ?? booking.estimatedFare : booking.estimatedFare;
  const fareLabel =
    role === "DRIVER" && booking.finalFare !== undefined
      ? "Tarif Final"
      : "Estimasi Tarif";
  const detailsHref =
    role === "CUSTOMER"
      ? `/customer/trips/${booking.id}`
      : `/driver/orders/${booking.id}`;

  return (
    <div
      className={cn(
        "tactile-card p-4 md:p-5 transition-all hover:border-slate-300 hover:shadow-tactile-card-hover group",
        className
      )}
    >
      {/* Top Header: ID, Date, Status */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-slate-500">
            {booking.id}
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs text-rf-text-secondary">
            {formatDateTime(booking.createdAt)}
          </span>
        </div>
        <StatusBadge status={booking.status} size="sm" />
      </div>

      {/* Middle: Route & Vehicle */}
      <div className="py-3.5 space-y-2.5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200 shadow-[inset_0_1px_0_#ffffff]">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Titik Jemput
            </p>
            <p className="text-sm font-semibold text-rf-text truncate">
              {booking.pickup.name}
            </p>
            <p className="text-xs text-rf-text-secondary truncate">
              {booking.pickup.address}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-6 h-6 rounded-full bg-rf-navy text-white flex items-center justify-center shrink-0 shadow-sm">
            <Navigation className="w-3.5 h-3.5 rotate-45" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Tujuan
            </p>
            <p className="text-sm font-semibold text-rf-text truncate">
              {booking.destination.name}
            </p>
            <p className="text-xs text-rf-text-secondary truncate">
              {booking.destination.address}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Info & Action */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-md text-xs font-semibold text-rf-text shadow-[inset_0_1px_1px_rgba(0,0,0,0.04)]">
            {isMotor ? (
              <Bike className="w-3.5 h-3.5 text-rf-blue" />
            ) : (
              <Car className="w-3.5 h-3.5 text-rf-blue" />
            )}
            <span>{isMotor ? "Motor" : "Mobil"}</span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-slate-400 leading-none">
              {fareLabel}
            </span>
            <span className="text-sm font-bold text-rf-text leading-tight mt-0.5">
              {formatIDR(displayedFare)}
            </span>
          </div>
        </div>

        {onSelect ? (
          <button
            onClick={onSelect}
            className="flex items-center gap-1 text-xs font-semibold text-rf-blue group-hover:translate-x-0.5 transition-transform"
          >
            <span>Lihat Detail</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <Link
            href={detailsHref}
            className="flex items-center gap-1 text-xs font-semibold text-rf-blue hover:text-rf-blue-hover group-hover:translate-x-0.5 transition-transform"
          >
            <span>Lihat Detail</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>
    </div>
  );
};
