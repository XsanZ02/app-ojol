"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CarFront,
  CircleDollarSign,
  ClipboardList,
  Users,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  formatAdminDate,
  formatAdminMoney,
} from "@/components/admin/AdminTableUtils";
import { SurfaceCard } from "@/components/ui/SurfaceCard";
import {
  adminApi,
  AuthApiError,
  type AdminDashboard,
} from "@/lib/auth-api";
import { useAuth } from "@/lib/auth-context";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: AdminDashboard };

const statisticCards = [
  { key: "totalUsers", label: "Total pengguna", icon: Users },
  { key: "totalDrivers", label: "Total mitra pengemudi", icon: CarFront },
  { key: "onlineDrivers", label: "Mitra pengemudi aktif", icon: CarFront },
  { key: "totalOrders", label: "Total pesanan", icon: ClipboardList },
  { key: "activeOrders", label: "Pesanan aktif", icon: BarChart3 },
  { key: "completedOrders", label: "Pesanan selesai", icon: ClipboardList },
] as const;

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    adminApi
      .getDashboard()
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
          message:
            error instanceof Error
              ? error.message
              : "Ringkasan dashboard tidak dapat dimuat.",
        });
      });
    return () => {
      active = false;
    };
  }, [reloadKey, router]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">
              Pusat kendali RideFlow
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-rf-navy sm:text-3xl">
              Dashboard Administrator
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-rf-text-secondary">
              Statistik operasional dan transaksi RideFlow.
            </p>
          </div>
          <div className="rounded-rf border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
            Administrator: {user?.name}
          </div>
        </section>

        {state.status === "loading" && (
          <AdminLoading label="Memuat statistik operasional..." />
        )}
        {state.status === "error" && (
          <AdminError
            message={state.message}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        )}
        {state.status === "success" && (
          <>
            <section
              aria-label="Statistik RideFlow"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {statisticCards.map((card) => {
                const Icon = card.icon;
                return (
                  <SurfaceCard
                    key={card.key}
                    elevation="subtle"
                    className="min-h-32 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-rf-text-secondary">
                          {card.label}
                        </p>
                        <p className="mt-4 text-3xl font-black tabular-nums text-rf-navy">
                          {state.data[card.key].toLocaleString("id-ID")}
                        </p>
                      </div>
                      <span className="rounded-rf bg-blue-50 p-2.5 text-rf-blue">
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>
                  </SurfaceCard>
                );
              })}
              <SurfaceCard elevation="subtle" className="min-h-32 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-rf-text-secondary">
                      Pendapatan pembayaran berhasil
                    </p>
                    <p className="mt-4 text-2xl font-black text-rf-navy">
                      {formatAdminMoney(state.data.revenue)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Hanya transaksi berhasil yang dihitung
                    </p>
                  </div>
                  <span className="rounded-rf bg-emerald-50 p-2.5 text-emerald-700">
                    <CircleDollarSign className="h-5 w-5" />
                  </span>
                </div>
              </SurfaceCard>
            </section>

            <section className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
              <SurfaceCard elevation="subtle" className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 p-5">
                  <div>
                    <h2 className="font-extrabold text-rf-navy">Pesanan terbaru</h2>
                    <p className="mt-1 text-xs text-rf-text-secondary">
                      Ringkasan dari perjalanan terbaru.
                    </p>
                  </div>
                  <Link href="/admin/orders" className="text-xs font-bold text-rf-blue hover:underline">
                    Semua pesanan
                  </Link>
                </div>
                {state.data.recentOrders.length === 0 ? (
                  <div className="p-4">
                    <AdminEmpty>Belum ada pesanan.</AdminEmpty>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Order</th>
                          <th className="px-4 py-3">Customer / Driver</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Tarif</th>
                          <th className="px-4 py-3">Dibuat</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {state.data.recentOrders.map((order) => (
                          <tr key={order.id}>
                            <td className="px-4 py-3">
                              <Link href={`/admin/orders/${order.id}`} className="font-bold text-rf-blue hover:underline">
                                #{order.id}
                              </Link>
                              <p className="text-xs text-slate-500">{order.vehicleType}</p>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <p>{order.customerName}</p>
                              <p className="text-slate-500">{order.driverName ?? "Belum ditugaskan"}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase">
                                {order.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                              {formatAdminMoney(order.finalFare ?? order.estimatedFare, order.currencyCode)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                              {formatAdminDate(order.requestedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SurfaceCard>

              <SurfaceCard elevation="subtle" className="overflow-hidden">
                <div className="border-b border-slate-100 p-5">
                  <h2 className="font-extrabold text-rf-navy">Aktivitas profil driver</h2>
                  <p className="mt-1 text-xs text-rf-text-secondary">
                    Profil yang terakhir diperbarui, bukan audit log status.
                  </p>
                </div>
                {state.data.recentDriverActivity.length === 0 ? (
                  <div className="p-4">
                    <AdminEmpty>Belum ada profil driver.</AdminEmpty>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {state.data.recentDriverActivity.map((driver) => (
                      <li key={driver.id} className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <Link href={`/admin/drivers/${driver.id}`} className="truncate text-sm font-bold text-rf-blue hover:underline">
                            {driver.name}
                          </Link>
                          <p className="truncate text-xs text-slate-500">{driver.email}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{formatAdminDate(driver.updatedAt)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${driver.online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                          {driver.online ? "ONLINE" : "OFFLINE"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SurfaceCard>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
