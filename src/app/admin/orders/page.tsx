"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminEmpty, AdminError, AdminLoading, AdminPagination, formatAdminDate, formatAdminMoney } from "@/components/admin/AdminTableUtils";
import { AuthApiError, adminApi, type AdminOrderPage } from "@/lib/auth-api";

const PAGE_SIZE = 20;
const ORDER_STATUSES = ["requested", "accepted", "picking_up", "in_progress", "completed", "cancelled"];
type State = { status: "loading" } | { status: "error"; message: string } | { status: "success"; data: AdminOrderPage };

export default function AdminOrdersPage() {
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
      adminApi.listOrders({ search, status, page, size: PAGE_SIZE }).then((data) => {
        if (active) setState({ status: "success", data });
      }).catch((error: unknown) => {
        if (!active) return;
        if (error instanceof AuthApiError && error.status === 401) { router.replace("/login"); return; }
        if (error instanceof AuthApiError && error.status === 403) { router.replace("/login?error=admin_access_denied"); return; }
        setState({ status: "error", message: error instanceof Error ? error.message : "Daftar order gagal dimuat." });
      });
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, reloadKey, router, search, status]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="border-b border-slate-200 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">Administrasi RideFlow</p>
          <h1 className="mt-2 text-2xl font-black text-rf-navy sm:text-3xl">Manajemen Order</h1>
          <p className="mt-2 text-sm text-rf-text-secondary">Cari dan tinjau perjalanan, customer, driver, dan statusnya.</p>
        </section>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari ID, nama, atau email" aria-label="Cari order" className="min-h-11 flex-1 rounded-rf border border-slate-200 bg-white px-3 text-sm outline-none focus:border-rf-blue" />
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter status order" className="min-h-11 rounded-rf border border-slate-200 bg-white px-3 text-sm">
            <option value="">Semua status</option>{ORDER_STATUSES.map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
          </select>
        </div>
        {state.status === "loading" && <AdminLoading label="Memuat order..." />}
        {state.status === "error" && <AdminError message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />}
        {state.status === "success" && (
          <div className="overflow-hidden rounded-rf-md border border-slate-200 bg-white">
            {state.data.orders.length === 0 ? <AdminEmpty>Tidak ada order yang cocok.</AdminEmpty> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Rute</th><th className="px-4 py-3">Tarif</th><th className="px-4 py-3">Dipesan</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{state.data.orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-3"><Link href={`/admin/orders/${order.id}`} className="font-bold text-rf-blue hover:underline">#{order.id}</Link><p className="text-xs text-slate-500">{order.vehicleType}</p></td>
                        <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase">{order.status.replace("_", " ")}</span></td>
                        <td className="px-4 py-3"><p>{order.customerName}</p><p className="text-xs text-slate-500">{order.customerEmail}</p></td>
                        <td className="px-4 py-3">{order.driverId ? <><Link href={`/admin/drivers/${order.driverId}`} className="font-semibold text-rf-blue hover:underline">{order.driverName}</Link><p className="text-xs text-slate-500">{order.driverEmail}</p></> : <span className="text-xs text-slate-500">Belum ditugaskan</span>}</td>
                        <td className="max-w-56 px-4 py-3 text-xs"><p className="truncate">{order.pickupAddress}</p><p className="truncate text-slate-500">→ {order.dropoffAddress}</p></td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">{formatAdminMoney(order.finalFare ?? order.estimatedFare, order.currencyCode)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatAdminDate(order.requestedAt)}</td>
                      </tr>
                    ))}</tbody>
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
