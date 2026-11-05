"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  formatAdminDate,
} from "@/components/admin/AdminTableUtils";
import { AuthApiError, adminApi, type AdminUser } from "@/lib/auth-api";

type UserDetailState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "success"; user: AdminUser };

export default function AdminUserDetailPage({
  params,
}: {
  params: { userId: string };
}) {
  const router = useRouter();
  const [state, setState] = useState<UserDetailState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    adminApi
      .getUser(params.userId)
      .then((user) => {
        if (active) setState({ status: "success", user });
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
        if (error instanceof AuthApiError && error.status === 404) {
          setState({ status: "empty" });
          return;
        }
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Detail pengguna gagal dimuat.",
        });
      });
    return () => {
      active = false;
    };
  }, [params.userId, reloadKey, router]);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/admin/users" className="text-sm font-bold text-rf-blue hover:underline">
          ← Kembali ke pengguna
        </Link>
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">
            Detail akun
          </p>
          <h1 className="mt-2 text-2xl font-black text-rf-navy">Pengguna #{params.userId}</h1>
        </section>
        {state.status === "loading" && <AdminLoading label="Memuat detail pengguna..." />}
        {state.status === "error" && (
          <AdminError message={state.message} onRetry={() => setReloadKey((key) => key + 1)} />
        )}
        {state.status === "empty" && <AdminEmpty>Pengguna tidak ditemukan.</AdminEmpty>}
        {state.status === "success" && (
          <section className="grid gap-4 sm:grid-cols-2">
            <Detail label="Nama" value={state.user.name} />
            <Detail label="Email" value={state.user.email} />
            <Detail label="Status akun" value={state.user.status} />
            <Detail label="Terdaftar" value={formatAdminDate(state.user.createdAt)} />
            <div className="rounded-rf-md border border-slate-200 bg-white p-5 sm:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Role</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {state.user.roles.map((role) => (
                  <span key={role} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-rf-blue">
                    {role}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Tampilan read-only. Informasi autentikasi dan kredensial tidak disediakan oleh endpoint admin.
            </p>
          </section>
        )}
      </div>
    </AdminLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-rf-md border border-slate-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-rf-text">{value || "—"}</p>
    </div>
  );
}
