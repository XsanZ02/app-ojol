import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/ToastNotification";

export const metadata: Metadata = {
  title: "RideFlow — Perjalanan Nyaman di Bali",
  description:
    "Pesan perjalanan, pantau perjalanan aktif, dan kelola akun RideFlow Anda.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-rf-bg text-rf-text antialiased font-sans">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
