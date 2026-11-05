"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  formatAdminDate,
} from "@/components/admin/AdminTableUtils";
import { AuthApiError, adminApi, type AdminDriverPage } from "@/lib/auth-api";

const PAGE_SIZE = 20;
type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AdminDriverPage };

export default function AdminDriversPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setState({ status: "loading" });
      adminApi.listDrivers({ search, status, page, size: PAGE_SIZE })
        .then((data) => {
          if (active) setState({ status: "success", data });
        })
        .catch((error: unknown) => {
          if (!active) return;
          if (error instanceof AuthApiError && error.status === 401) {
            router.replace("/login");
            return;
          }
          if (error instanceof AuthApiError && error.status === 403) {
            router.replace("/login?error=admin_access_denied");
            return;
          }
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Daftar driver gagal dimuat.",
          });
        });
    }, search ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, reloadKey, router, search, status]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeading title="Manajemen Driver" subtitle="Status operasional, kendaraan, dan perjalanan dari backend." />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Cari nama atau email driver"
            aria-label="Cari nama atau email driver"
            className="min-h-11 flex-1 rounded-rf border border-slate-200 bg-white px-3 text-sm outline-none focus:border-rf-blue"
          />
          <select
            value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            aria-label="Filter status operasional"
            className="min-h-11 rounded-rf border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">Semua status operasional</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {state.status === "loading" && <AdminLoading label="Memuat daftar driver..." />}
        {state.status === "error" && <AdminError message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />}
        {state.status === "success" && (
          <div className="overflow-hidden rounded-rf-md border border-slate-200 bg-white">
            {state.data.drivers.length === 0 ? <AdminEmpty>Tidak ada driver yang cocok.</AdminEmpty> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Driver</th><th className="px-4 py-3">Akun</th>
                        <th className="px-4 py-3">Operasional</th><th className="px-4 py-3">Online</th>
                        <th className="px-4 py-3">Kendaraan</th><th className="px-4 py-3">Order selesai</th>
                        <th className="px-4 py-3">Diperbarui</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.data.drivers.map((driver) => (
                        <tr key={driver.id}>
                          <td className="px-4 py-3">
                            <Link href={`/admin/drivers/${driver.id}`} className="font-bold text-rf-blue hover:underline">{driver.name}</Link>
                            <p className="text-xs text-slate-500">{driver.email}</p>
                          </td>
                          <td className="px-4 py-3">{driver.accountStatus}</td>
                          <td className="px-4 py-3">{driver.operationalStatus}</td>
                          <td className="px-4 py-3">{driver.online ? "Online" : "Offline"}</td>
                          <td className="px-4 py-3 tabular-nums">{driver.vehicleCount}</td>
                          <td className="px-4 py-3 tabular-nums">{driver.completedTrips}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatAdminDate(driver.updatedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <AdminPagination page={page} size={state.data.size} total={state.data.total} onChange={setPage} />
              </>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function PageHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="border-b border-slate-200 pb-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">Administrasi RideFlow</p>
      <h1 className="mt-2 text-2xl font-black text-rf-navy sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-rf-text-secondary">{subtitle}</p>
    </section>
  );
}
