"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminEmpty, AdminError, AdminLoading, formatAdminDate, formatAdminMoney } from "@/components/admin/AdminTableUtils";
import { AuthApiError, adminApi, type AdminOrderDetail } from "@/lib/auth-api";

type State = { status: "loading" } | { status: "error"; message: string } | { status: "empty" } | { status: "success"; data: AdminOrderDetail };

export default function AdminOrderDetailPage({ params }: { params: { tripId: string } }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    adminApi.getOrder(params.tripId).then((data) => {
      if (active) setState({ status: "success", data });
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof AuthApiError && error.status === 401) { router.replace("/login"); return; }
      if (error instanceof AuthApiError && error.status === 403) { router.replace("/login?error=admin_access_denied"); return; }
      if (error instanceof AuthApiError && error.status === 404) { setState({ status: "empty" }); return; }
      setState({ status: "error", message: error instanceof Error ? error.message : "Detail order gagal dimuat." });
    });
    return () => { active = false; };
  }, [params.tripId, reloadKey, router]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/admin/orders" className="text-sm font-bold text-rf-blue hover:underline">← Kembali ke order</Link>
        <section><p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">Detail perjalanan</p><h1 className="mt-2 text-2xl font-black text-rf-navy">Order #{params.tripId}</h1></section>
        {state.status === "loading" && <AdminLoading label="Memuat detail order..." />}
        {state.status === "error" && <AdminError message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />}
        {state.status === "empty" && <AdminEmpty>Order tidak ditemukan.</AdminEmpty>}
        {state.status === "success" && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Status" value={state.data.order.status} />
              <Info label="Jenis kendaraan" value={state.data.order.vehicleType} />
              <Info label="Customer" value={`${state.data.order.customerName} · ${state.data.order.customerEmail}`} />
              <Info label="Driver" value={state.data.order.driverName ? `${state.data.order.driverName} · ${state.data.order.driverEmail}` : "Belum ditugaskan"} />
              <Info label="Tarif estimasi" value={formatAdminMoney(state.data.order.estimatedFare, state.data.order.currencyCode)} />
              <Info label="Tarif final" value={formatAdminMoney(state.data.order.finalFare, state.data.order.currencyCode)} />
              <Info label="Dipesan" value={formatAdminDate(state.data.order.requestedAt)} />
              <Info label="Diterima" value={formatAdminDate(state.data.order.acceptedAt)} />
              <Info label="Selesai" value={formatAdminDate(state.data.order.completedAt)} />
              <Info label="Penjemputan" value={state.data.order.pickupAddress} />
              <Info label="Tujuan" value={state.data.order.dropoffAddress} />
            </section>
            <section className="rounded-rf-md border border-slate-200 bg-white p-5">
              <h2 className="font-extrabold text-rf-navy">Riwayat status</h2>
              {state.data.history.length === 0 ? <div className="mt-4"><AdminEmpty>Riwayat status belum tersedia.</AdminEmpty></div> : (
                <ol className="mt-4 space-y-3">{state.data.history.map((item, index) => (
                  <li key={`${item.timestamp}-${index}`} className="flex gap-3 border-l-2 border-blue-100 pl-4">
                    <div><p className="text-sm font-bold uppercase text-rf-text">{item.status}</p><p className="mt-1 text-xs text-slate-500">{formatAdminDate(item.timestamp)}{item.note ? ` · ${item.note}` : ""}</p></div>
                  </li>
                ))}</ol>
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
