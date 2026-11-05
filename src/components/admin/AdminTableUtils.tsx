"use client";

import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export function formatAdminMoney(
  amount: number | null | undefined,
  currency = "IDR"
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function AdminLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 rounded-rf-md border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-rf-text">{label}</p>
      {[0, 1, 2].map((row) => (
        <div key={row} className="h-12 animate-pulse rounded-rf bg-slate-100" />
      ))}
    </div>
  );
}

export function AdminError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-rf-md border border-rose-200 bg-white px-5 py-10 text-center">
      <AlertCircle className="h-8 w-8 text-rose-500" />
      <p className="text-sm font-semibold text-rose-800">Data gagal dimuat</p>
      <p className="max-w-lg text-xs text-rf-text-secondary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-10 rounded-rf bg-rf-blue px-4 text-sm font-bold text-white transition hover:bg-rf-navy"
      >
        Coba lagi
      </button>
    </div>
  );
}

export function AdminEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-rf-md border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-rf-text-secondary">
      {children}
    </div>
  );
}

export function AdminPagination({
  page,
  size,
  total,
  onChange,
}: {
  page: number;
  size: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const firstItem = total === 0 ? 0 : (page - 1) * size + 1;
  const lastItem = Math.min(page * size, total);
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">
        Menampilkan {firstItem}–{lastItem} dari {total}
      </p>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button
          type="button"
          aria-label="Halaman sebelumnya"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="inline-flex min-h-9 items-center gap-1 rounded-rf border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Sebelumnya
        </button>
        <span className="text-xs font-semibold text-slate-600">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          aria-label="Halaman berikutnya"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="inline-flex min-h-9 items-center gap-1 rounded-rf border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Berikutnya
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
