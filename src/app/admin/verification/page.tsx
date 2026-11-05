"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminEmpty, AdminError, AdminLoading } from "@/components/admin/AdminTableUtils";
import {
  adminApi,
  AuthApiError,
  type VerificationDocument,
  type VerificationDriverDetail,
  type VerificationQueue,
} from "@/lib/auth-api";

type QueueState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; queue: VerificationQueue };

const EMPTY_QUEUE: VerificationQueue = { profiles: [], vehicles: [], documents: [] };

export default function AdminDriverVerificationPage() {
  const [state, setState] = useState<QueueState>({ status: "loading" });
  const [selectedDriver, setSelectedDriver] = useState<VerificationDriverDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const queue = await adminApi.getVerificationQueue();
      setState({ status: "success", queue });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Antrean verifikasi gagal dimuat.",
      });
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const loadDriverDetail = async (driverId: string) => {
    setDetailError(null);
    try {
      setSelectedDriver(await adminApi.getVerificationDriver(driverId));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Detail driver gagal dimuat.");
    }
  };

  const decide = async (
    type: "profiles" | "vehicles" | "documents",
    id: string,
    title: string
  ) => {
    if (!window.confirm(`Setujui ${title}?`)) return;
    setBusy(`${type}:${id}`);
    try {
      await adminApi.decideVerification(type, id, "approved");
      await loadQueue();
      if (selectedDriver) await loadDriverDetail(selectedDriver.profile.driverId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Keputusan verifikasi gagal disimpan.");
    } finally {
      setBusy(null);
    }
  };

  const openDocument = async (document: VerificationDocument) => {
    const tab = window.open("about:blank", "_blank");
    try {
      const file = await adminApi.getVerificationDocumentFile(document.id);
      if (!tab) {
        window.alert("Izinkan pop-up untuk membuka dokumen.");
        return;
      }
      const url = URL.createObjectURL(file);
      tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      tab?.close();
      window.alert(error instanceof Error ? error.message : "Dokumen gagal dibuka.");
    }
  };

  const queue = state.status === "success" ? state.queue : EMPTY_QUEUE;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="border-b border-slate-200 pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-rf-blue">Administrasi RideFlow</p>
          <h1 className="mt-2 text-2xl font-black text-rf-navy sm:text-3xl">Verifikasi Driver</h1>
          <p className="mt-2 text-sm text-rf-text-secondary">
            Periksa dokumen dan putuskan verifikasi profil serta kendaraan secara terpisah.
          </p>
        </section>

        {state.status === "loading" && <AdminLoading label="Memuat antrean verifikasi..." />}
        {state.status === "error" && <AdminError message={state.message} onRetry={() => void loadQueue()} />}
        {state.status === "success" && (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <Count label="Profil" count={queue.profiles.length} />
              <Count label="Kendaraan" count={queue.vehicles.length} />
              <Count label="Dokumen" count={queue.documents.length} />
            </section>
            <section className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-5">
                <QueueSection title="Profil menunggu review" empty="Tidak ada profil pending.">
                  {queue.profiles.map((profile) => (
                    <article key={profile.driverId} className="rounded-rf-md border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="font-bold text-rf-navy">{profile.name}</h2>
                          <p className="text-xs text-slate-500">{profile.email} · driver #{profile.driverId}</p>
                          <p className="mt-2 text-xs">Profil: <b>{profile.verificationStatus}</b> · versi {profile.submissionVersion}</p>
                        </div>
                        <div className="flex gap-2">
                          <button className="rounded border px-3 py-1.5 text-xs font-bold text-rf-blue" onClick={() => void loadDriverDetail(profile.driverId)}>Detail</button>
                          <DecisionButtons
                            busy={busy === `profiles:${profile.driverId}`}
                            onApprove={() => void decide("profiles", profile.driverId, `profil ${profile.name}`)}
                            onReject={() => void decideReject("profiles", profile.driverId, `profil ${profile.name}`)}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </QueueSection>
                <QueueSection title="Kendaraan menunggu review" empty="Tidak ada kendaraan pending.">
                  {queue.vehicles.map((vehicle) => (
                    <article key={vehicle.id} className="rounded-rf-md border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h2 className="font-bold text-rf-navy">{vehicle.make} {vehicle.model} · {vehicle.plate}</h2>
                          <p className="text-xs text-slate-500">Driver #{vehicle.driverId} · {vehicle.type}</p>
                          {vehicle.rejectionReason && <p className="mt-2 text-xs text-rose-700">Alasan: {vehicle.rejectionReason}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button className="rounded border px-3 py-1.5 text-xs font-bold text-rf-blue" onClick={() => void loadDriverDetail(vehicle.driverId)}>Detail</button>
                          <DecisionButtons
                            busy={busy === `vehicles:${vehicle.id}`}
                            onApprove={() => void decide("vehicles", vehicle.id, `kendaraan ${vehicle.plate}`)}
                            onReject={() => void decideReject("vehicles", vehicle.id, `kendaraan ${vehicle.plate}`)}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </QueueSection>
              </div>
              <QueueSection title="Dokumen menunggu review" empty="Tidak ada dokumen pending.">
                {queue.documents.map((document) => {
                  const label = documentTypeLabel(document.type);
                  return (
                    <article key={document.id} className="rounded-rf-md border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-bold text-rf-navy">{label} · driver #{document.driverId}</h2>
                          <p className="mt-1 break-all text-xs text-slate-500">
                            {document.filename} · versi {document.version} · {formatBytes(document.fileSize)}
                          </p>
                          <Link href={`/admin/drivers/${document.driverId}`} className="mt-1 inline-block text-xs font-bold text-rf-blue hover:underline">
                            Profil driver
                          </Link>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded border px-3 py-1.5 text-xs font-bold text-rf-blue" onClick={() => void openDocument(document)}>Lihat file</button>
                          <DecisionButtons
                            busy={busy === `documents:${document.id}`}
                            onApprove={() => void decide("documents", document.id, label)}
                            onReject={() => void decideReject("documents", document.id, label)}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </QueueSection>
            </section>
            {detailError && <p role="alert" className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{detailError}</p>}
            {selectedDriver && (
              <DriverVerificationDetail
                detail={selectedDriver}
                onFile={openDocument}
                onDecision={decide}
                onReject={decideReject}
                busy={busy}
                onClose={() => setSelectedDriver(null)}
              />
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );

  async function decideReject(
    type: "profiles" | "vehicles" | "documents",
    id: string,
    title: string
  ) {
    const reason = window.prompt(`Alasan menolak ${title}:`);
    if (!reason?.trim()) return;
    setBusy(`${type}:${id}`);
    try {
      await adminApi.decideVerification(type, id, "rejected", reason.trim());
      await loadQueue();
      if (selectedDriver) await loadDriverDetail(selectedDriver.profile.driverId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Keputusan verifikasi gagal disimpan.");
    } finally {
      setBusy(null);
    }
  }
}

function QueueSection({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="space-y-3">
      <h2 className="font-extrabold text-rf-navy">{title}</h2>
      {!hasItems ? <AdminEmpty>{empty}</AdminEmpty> : <div className="space-y-3">{children}</div>}
    </section>
  );
}

function Count({ label, count }: { label: string; count: number }) {
  return <div className="rounded-rf-md border border-slate-200 bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-rf-navy">{count}</p></div>;
}

function DecisionButtons({
  busy,
  onApprove,
  onReject,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <button disabled={busy} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={onApprove}>ACC</button>
      <button disabled={busy} className="rounded bg-rose-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={onReject}>Tolak</button>
    </>
  );
}

function DriverVerificationDetail({
  detail,
  onFile,
  onDecision,
  onReject,
  busy,
  onClose,
}: {
  detail: VerificationDriverDetail;
  onFile: (document: VerificationDocument) => Promise<void>;
  onDecision: (type: "profiles" | "vehicles" | "documents", id: string, title: string) => Promise<void>;
  onReject: (type: "profiles" | "vehicles" | "documents", id: string, title: string) => Promise<void>;
  busy: string | null;
  onClose: () => void;
}) {
  return (
    <section className="space-y-4 rounded-rf-md border border-slate-200 bg-slate-50 p-5">
      <header className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-black text-rf-navy">Detail {detail.profile.name}</h2><p className="text-sm text-slate-600">{detail.profile.email}</p></div>
        <button className="text-sm font-bold text-rf-blue" onClick={onClose}>Tutup</button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-white p-3">
        <span className="text-sm">Profil: {detail.profile.verificationStatus}{detail.profile.rejectionReason ? ` · ${detail.profile.rejectionReason}` : ""}</span>
        {detail.profile.verificationStatus === "pending" && (
          <DecisionButtons busy={busy === `profiles:${detail.profile.driverId}`} onApprove={() => void onDecision("profiles", detail.profile.driverId, `profil ${detail.profile.name}`)} onReject={() => void onReject("profiles", detail.profile.driverId, `profil ${detail.profile.name}`)} />
        )}
      </div>
      <div className="space-y-2">
        <h3 className="font-bold text-rf-navy">Kendaraan</h3>
        {detail.vehicles.map((vehicle) => (
          <div key={vehicle.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white p-3 text-sm">
            <span>{vehicle.make} {vehicle.model} · {vehicle.plate} · {vehicle.verificationStatus}{vehicle.rejectionReason ? ` · ${vehicle.rejectionReason}` : ""}</span>
            {vehicle.verificationStatus === "pending" && <DecisionButtons busy={busy === `vehicles:${vehicle.id}`} onApprove={() => void onDecision("vehicles", vehicle.id, `kendaraan ${vehicle.plate}`)} onReject={() => void onReject("vehicles", vehicle.id, `kendaraan ${vehicle.plate}`)} />}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h3 className="font-bold text-rf-navy">Dokumen dan keputusan</h3>
        {detail.documents.map((document) => (
          <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white p-3 text-sm">
            <span>{documentTypeLabel(document.type)} · {document.filename} · v{document.version} · {document.status}{document.rejectionReason ? ` · ${document.rejectionReason}` : ""}</span>
            <div className="flex gap-2">
              <button className="font-bold text-rf-blue" onClick={() => void onFile(document)}>Lihat</button>
              {document.status === "pending" && <DecisionButtons busy={busy === `documents:${document.id}`} onApprove={() => void onDecision("documents", document.id, documentTypeLabel(document.type))} onReject={() => void onReject("documents", document.id, documentTypeLabel(document.type))} />}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1">
        <h3 className="font-bold text-rf-navy">Riwayat audit</h3>
        {detail.history.length === 0 ? <p className="text-sm text-slate-500">Belum ada keputusan.</p> : detail.history.map((event, index) => (
          <p key={`${event.subjectType}-${event.subjectId}-${event.reviewedAt}-${index}`} className="text-xs text-slate-600">
            {event.subjectType} #{event.subjectId}: {event.decision} oleh admin #{event.reviewerId} · {new Date(event.reviewedAt).toLocaleString("id-ID")}{event.rejectionReason ? ` · ${event.rejectionReason}` : ""}
          </p>
        ))}
      </div>
    </section>
  );
}

function documentTypeLabel(type: string): string {
  return ({ ktp: "KTP", sim: "SIM", stnk: "STNK", vehicle_photo: "Foto kendaraan" } as Record<string, string>)[type] || type;
}

function formatBytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
