"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  AdminUsersTable,
  type AdminUsersState,
} from "@/components/admin/AdminUsersTable";
import { AuthApiError, adminApi, type AdminUserPage } from "@/lib/auth-api";

const PAGE_SIZE = 20;

export default function AdminUsersPage() {
  const router = useRouter();
  const [state, setState] = useState<AdminUsersState>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setState({ status: "loading" });
      void adminApi
        .listUsers({ search, page, size: PAGE_SIZE })
        .then((data: AdminUserPage) => {
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
                : "Terjadi kesalahan saat mengambil daftar pengguna.",
          });
        });
    }, search ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [page, reloadKey, router, search]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="border-b border-slate-200 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">
            Administrasi RideFlow
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-rf-navy sm:text-3xl">
            Manajemen Pengguna
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-rf-text-secondary">
            Lihat daftar akun terdaftar dan peran yang dimiliki. Halaman ini
            hanya menampilkan data dan tidak menyediakan perubahan akun.
          </p>
        </section>

        <AdminUsersTable
          state={state}
          search={search}
          page={page}
          onSearch={handleSearch}
          onPageChange={setPage}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </div>
    </AdminLayout>
  );
}
