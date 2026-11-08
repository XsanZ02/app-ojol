"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminEmpty, AdminError, AdminLoading, formatAdminDate, formatAdminMoney } from "@/components/admin/AdminTableUtils";
import { AuthApiError, adminApi, type AdminDriverDetail } from "@/lib/auth-api";
import { getApiStatusLabel } from "@/lib/utils";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "empty" } | { status: "success"; data: AdminDriverDetail };

export default function AdminDriverDetailPage({ params }: { params: { driverId: string } }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    adminApi.getDriver(params.driverId).then((data) => {
      if (active) setState({ status: "success", data });
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof AuthApiError && error.status === 401) { router.replace("/login"); return; }
      if (error instanceof AuthApiError && error.status === 403) { router.replace("/login?error=admin_access_denied"); return; }
      if (error instanceof AuthApiError && error.status === 404) { setState({ status: "empty" }); return; }
      setState({ status: "error", message: error instanceof Error ? error.message : "Detail driver gagal dimuat." });
    });
    return () => { active = false; };
  }, [params.driverId, reloadKey, router]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/admin/drivers" className="text-sm font-bold text-rf-blue hover:underline">← Kembali ke driver</Link>
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">Detail driver</p>
          <h1 className="mt-2 text-2xl font-black text-rf-navy">Driver #{params.driverId}</h1>
        </section>
        {state.status === "loading" && <AdminLoading label="Memuat detail driver..." />}
        {state.status === "error" && <AdminError message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />}
        {state.status === "empty" && <AdminEmpty>Driver tidak ditemukan.</AdminEmpty>}
        {state.status === "success" && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info label="Nama" value={state.data.driver.name} />
              <Info label="Email" value={state.data.driver.email} />
              <Info label="Status akun" value={state.data.driver.accountStatus} />
              <Info label="Status operasional" value={state.data.driver.operationalStatus} />
              <Info label="Ketersediaan" value={state.data.driver.online ? "Online" : "Offline"} />
              <Info label="Perjalanan selesai" value={String(state.data.driver.completedTrips)} />
              <Info label="Terdaftar" value={formatAdminDate(state.data.driver.createdAt)} />
              <Info label="Diperbarui" value={formatAdminDate(state.data.driver.updatedAt)} />
            </section>
            <section className="overflow-hidden rounded-rf-md border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-5"><h2 className="font-extrabold text-rf-navy">Kendaraan</h2></div>
              {state.data.vehicles.length === 0 ? <div className="p-4"><AdminEmpty>Belum ada kendaraan terdaftar.</AdminEmpty></div> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Kendaraan</th><th className="px-4 py-3">Plat</th><th className="px-4 py-3">Warna</th><th className="px-4 py-3">Verifikasi</th><th className="px-4 py-3">Aktif</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{state.data.vehicles.map((vehicle) => (
                      <tr key={vehicle.id}><td className="px-4 py-3 font-semibold">{vehicle.make} {vehicle.model} <span className="text-xs text-slate-500">({vehicle.vehicleType})</span></td><td className="px-4 py-3 font-mono">{vehicle.plate}</td><td className="px-4 py-3">{vehicle.color}</td><td className="px-4 py-3">{vehicle.verificationStatus}</td><td className="px-4 py-3">{vehicle.active ? "Ya" : "Tidak"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="overflow-hidden rounded-rf-md border border-slate-200 bg-white">
              <div className="border-b border-slate-100 p-5"><h2 className="font-extrabold text-rf-navy">Perjalanan terbaru</h2></div>
              {state.data.recentOrders.length === 0 ? <div className="p-4"><AdminEmpty>Belum ada perjalanan.</AdminEmpty></div> : (
                <ul className="divide-y divide-slate-100">{state.data.recentOrders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                    <div><Link href={`/admin/orders/${order.id}`} className="font-bold text-rf-blue hover:underline">Pesanan #{order.id}</Link><p className="text-xs text-slate-500">{getApiStatusLabel(order.status)} · {order.customerName} · {formatAdminDate(order.requestedAt)}</p></div>
                    <span className="font-semibold">{formatAdminMoney(order.finalFare ?? order.estimatedFare, order.currencyCode)}</span>
                  </li>
                ))}</ul>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-rf-md border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-2 break-words text-sm font-semibold text-rf-text">{value || "—"}</p></div>;
}
