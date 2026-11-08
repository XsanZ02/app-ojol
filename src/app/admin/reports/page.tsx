"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminEmpty, AdminError, AdminLoading, AdminPagination, formatAdminDate, formatAdminMoney } from "@/components/admin/AdminTableUtils";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import { AuthApiError, adminApi, type AdminPaymentPage, type AdminPaymentReport } from "@/lib/auth-api";

const PAGE_SIZE = 20;
const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "refunded"];
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu pembayaran",
  succeeded: "Berhasil",
  failed: "Gagal",
  refunded: "Dana dikembalikan",
};
type ReportState = { status: "loading" } | { status: "error"; message: string } | { status: "success"; data: AdminPaymentReport };
type PaymentState = { status: "loading" } | { status: "error"; message: string } | { status: "success"; data: AdminPaymentPage };

export default function AdminReportsPage() {
  const router = useRouter();
  const [report, setReport] = useState<ReportState>({ status: "loading" });
  const [payments, setPayments] = useState<PaymentState>({ status: "loading" });
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    adminApi.getPaymentReport().then((data) => {
      if (active) setReport({ status: "success", data });
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof AuthApiError && error.status === 401) { router.replace("/login"); return; }
      if (error instanceof AuthApiError && error.status === 403) { router.replace("/login?error=admin_access_denied"); return; }
      setReport({ status: "error", message: error instanceof Error ? error.message : "Ringkasan pembayaran gagal dimuat." });
    });
    return () => { active = false; };
  }, [reloadKey, router]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setPayments({ status: "loading" });
      adminApi.listPayments({ search, status, page, size: PAGE_SIZE }).then((data) => {
        if (active) setPayments({ status: "success", data });
      }).catch((error: unknown) => {
        if (!active) return;
        if (error instanceof AuthApiError && error.status === 401) { router.replace("/login"); return; }
        if (error instanceof AuthApiError && error.status === 403) { router.replace("/login?error=admin_access_denied"); return; }
        setPayments({ status: "error", message: error instanceof Error ? error.message : "Daftar pembayaran gagal dimuat." });
      });
    }, search ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [page, reloadKey, router, search, status]);

  const retry = () => setReloadKey((key) => key + 1);
  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="border-b border-slate-200 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">Administrasi RideFlow</p>
          <h1 className="mt-2 text-2xl font-black text-rf-navy sm:text-3xl">Pembayaran & Laporan</h1>
          <p className="mt-2 text-sm text-rf-text-secondary">Pantau status pembayaran dan nilai transaksi RideFlow.</p>
        </section>
        {report.status === "loading" && <AdminLoading label="Memuat ringkasan pembayaran..." />}
        {report.status === "error" && <AdminError message={report.message} onRetry={retry} />}
        {report.status === "success" && (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Menunggu pembayaran" value={report.data.pendingCount.toLocaleString("id-ID")} />
            <Metric label="Berhasil" value={report.data.succeededCount.toLocaleString("id-ID")} />
            <Metric label="Gagal" value={report.data.failedCount.toLocaleString("id-ID")} />
            <Metric label="Dana dikembalikan" value={report.data.refundedCount.toLocaleString("id-ID")} />
            <Metric label="Total pembayaran berhasil" value={formatAdminMoney(report.data.succeededRevenue)} />
            <Metric label="Nilai dana dikembalikan" value={formatAdminMoney(report.data.refundedAmount)} />
          </section>
        )}
        <section className="flex flex-col gap-3 sm:flex-row">
          <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Cari ID perjalanan, nama, atau email" aria-label="Cari pembayaran" className="min-h-11 flex-1 rounded-rf border border-slate-200 bg-white px-3 text-sm outline-none focus:border-rf-blue" />
          <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Filter status pembayaran" className="min-h-11 rounded-rf border border-slate-200 bg-white px-3 text-sm">
            <option value="">Semua status pembayaran</option>{PAYMENT_STATUSES.map((value) => <option key={value} value={value}>{PAYMENT_STATUS_LABELS[value]}</option>)}
          </select>
        </section>
        {payments.status === "loading" && <AdminLoading label="Memuat transaksi..." />}
        {payments.status === "error" && <AdminError message={payments.message} onRetry={retry} />}
        {payments.status === "success" && (
          <div className="overflow-hidden rounded-rf-md border border-slate-200 bg-white">
            {payments.data.payments.length === 0 ? <AdminEmpty>Belum ada transaksi yang cocok.</AdminEmpty> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[850px] text-left text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Perjalanan</th><th className="px-4 py-3">Penumpang / Mitra pengemudi</th><th className="px-4 py-3">Metode pembayaran</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Jumlah</th><th className="px-4 py-3">Waktu pembayaran</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{payments.data.payments.map((payment) => (
                      <tr key={payment.tripId}>
                        <td className="px-4 py-3 font-bold">#{payment.tripId}</td>
                        <td className="px-4 py-3"><p>{payment.customerName}</p><p className="text-xs text-slate-500">{payment.driverName ?? "Belum ditugaskan"}</p></td>
                        <td className="px-4 py-3 capitalize">{payment.method.replaceAll("_", " ")}</td>
                        <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{PAYMENT_STATUS_LABELS[payment.status] ?? "Status pembayaran belum tersedia"}</span></td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatAdminMoney(payment.amount, payment.currencyCode)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{formatAdminDate(payment.paidAt)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <AdminPagination page={page} size={payments.data.size} total={payments.data.total} onChange={setPage} />
              </>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500">Ringkasan ini menampilkan pembayaran sesuai status transaksi yang tercatat.</p>
      </div>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <SurfaceCard elevation="subtle" className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-3 text-xl font-black text-rf-navy">{value}</p></div><CircleDollarSign className="h-5 w-5 text-rf-blue" /></div></SurfaceCard>;
}
