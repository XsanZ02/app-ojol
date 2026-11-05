import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/ToastNotification";

export const metadata: Metadata = {
  title: "RideFlow — Modern Skeuomorphic Ride-Hailing",
  description:
    "Aplikasi ride-hailing modern skeuomorfik untuk pelanggan dan mitra pengemudi di Bali.",
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

