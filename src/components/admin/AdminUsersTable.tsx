"use client";

import React from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import type { AdminUserPage } from "@/lib/auth-api";

export type AdminUsersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AdminUserPage };

interface AdminUsersTableProps {
  state: AdminUsersState;
  search: string;
  page: number;
  onSearch: (value: string) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

export function AdminUsersTable({
  state,
  search,
  page,
  onSearch,
  onPageChange,
  onRetry,
}: AdminUsersTableProps) {
  const totalPages =
    state.status === "success"
      ? Math.max(1, Math.ceil(state.data.total / state.data.size))
      : 1;
  const firstItem =
    state.status === "success" && state.data.total > 0
      ? (page - 1) * state.data.size + 1
      : 0;
  const lastItem =
    state.status === "success"
      ? Math.min(page * state.data.size, state.data.total)
      : 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-extrabold text-rf-navy">
            Daftar pengguna
          </h2>
          <p className="mt-1 text-xs text-rf-text-secondary">
            Informasi akun yang tersedia di RideFlow.
          </p>
        </div>
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Cari berdasarkan email atau nama</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Cari email atau nama..."
            className="min-h-11 w-full rounded-rf border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-rf-text outline-none transition placeholder:text-slate-400 focus:border-rf-blue focus:ring-2 focus:ring-rf-blue/15"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-rf-md border border-slate-200 bg-white shadow-sm">
        {state.status === "loading" && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-3 p-5"
          >
            <p className="text-sm font-semibold text-rf-text">
              Memuat daftar pengguna...
            </p>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="h-12 animate-pulse rounded-rf bg-slate-100"
              />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-center gap-3 px-5 py-10 text-center"
          >
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="text-sm font-semibold text-rose-800">
              Daftar pengguna gagal dimuat
            </p>
            <p className="max-w-lg text-xs text-rf-text-secondary">
              {state.message}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-10 rounded-rf bg-rf-blue px-4 text-sm font-bold text-white transition hover:bg-rf-navy"
            >
              Coba lagi
            </button>
          </div>
        )}

        {state.status === "success" && state.data.users.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <span className="rounded-full bg-slate-100 p-3 text-slate-500">
              <Users className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-rf-text">
              {search.trim()
                ? "Tidak ada pengguna yang cocok"
                : "Belum ada pengguna terdaftar"}
            </p>
            <p className="text-xs text-rf-text-secondary">
              {search.trim()
                ? "Coba kata kunci email atau nama yang berbeda."
                : "Pengguna akan tampil di sini setelah terdaftar."}
            </p>
          </div>
        )}

        {state.status === "success" && state.data.users.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th scope="col" className="px-4 py-3">ID</th>
                    <th scope="col" className="px-4 py-3">Email</th>
                    <th scope="col" className="px-4 py-3">Nama</th>
                    <th scope="col" className="px-4 py-3">Role</th>
                    <th scope="col" className="px-4 py-3">Status akun</th>
                    <th scope="col" className="px-4 py-3">Terdaftar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.data.users.map((user) => (
                    <tr key={user.id} className="text-sm text-rf-text">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        <Link href={`/admin/users/${user.id}`} className="font-bold text-rf-blue hover:underline">
                          {user.id}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">
                        {user.email}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {user.name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.roles.map((role) => (
                            <span
                              key={role}
                              className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rf-blue"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${user.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Menampilkan {firstItem}–{lastItem} dari {state.data.total} pengguna
              </p>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <button
                  type="button"
                  aria-label="Halaman sebelumnya"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
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
                  onClick={() => onPageChange(page + 1)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-rf border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
