import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { BookingStatus } from "@/types/booking";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number to Indonesian Rupiah (e.g. 25000 -> "Rp25.000")
 */
export function formatIDR(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return "Rp0";
  }
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp${formatted}`;
}

/**
 * Format ISO date string into Indonesian format
 * e.g. "25 Okt 2026, 14:30"
 */
export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agu",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];

    const day = date.getDate().toString().padStart(2, "0");
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");

    return `${day} ${month} ${year}, ${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

/**
 * Short time format (e.g. "14:30")
 */
export function formatTimeOnly(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes} WITA`;
  } catch {
    return "";
  }
}

/**
 * Human-friendly Indonesian labels for booking statuses
 */
export function getStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "PENDING":
      return "Menunggu Pengemudi";
    case "ACCEPTED":
      return "Pengemudi Ditemukan";
    case "PICKING_UP":
      return "Menuju Lokasi Jemput";
    case "IN_PROGRESS":
      return "Dalam Perjalanan";
    case "COMPLETED":
      return "Perjalanan Selesai";
    case "CANCELLED":
      return "Perjalanan Dibatalkan";
    default:
      return status;
  }
}

/**
 * Badge styling classes for booking status
 */
export function getStatusBadgeConfig(status: BookingStatus) {
  switch (status) {
    case "PENDING":
      return {
        label: "Menunggu Pengemudi",
        badgeClass:
          "bg-amber-50 text-amber-700 border-amber-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        dotClass: "bg-amber-500 animate-pulse",
      };
    case "ACCEPTED":
      return {
        label: "Pengemudi Ditemukan",
        badgeClass:
          "bg-blue-50 text-blue-700 border-blue-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        dotClass: "bg-blue-600",
      };
    case "PICKING_UP":
      return {
        label: "Menuju Penjemputan",
        badgeClass:
          "bg-indigo-50 text-indigo-700 border-indigo-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        dotClass: "bg-indigo-600 animate-pulse",
      };
    case "IN_PROGRESS":
      return {
        label: "Dalam Perjalanan",
        badgeClass:
          "bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        dotClass: "bg-emerald-600 animate-ping",
      };
    case "COMPLETED":
      return {
        label: "Selesai",
        badgeClass:
          "bg-slate-100 text-slate-700 border-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        dotClass: "bg-slate-500",
      };
    case "CANCELLED":
      return {
        label: "Dibatalkan",
        badgeClass:
          "bg-rose-50 text-rose-700 border-rose-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
        dotClass: "bg-rose-500",
      };
    default:
      return {
        label: status,
        badgeClass: "bg-gray-100 text-gray-700 border-gray-200",
        dotClass: "bg-gray-400",
      };
  }
}

export function generateBookingId(): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `RF-${datePart}-${randomPart}`;
}

