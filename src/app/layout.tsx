import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Basket Monster",
  description: "Basketball match center, live signals, recommendations, and performance.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: "/apple-touch-icon.png"
  },
  appleWebApp: { capable: true, title: "Basket Monster", statusBarStyle: "black-translucent" }
};

export const viewport: Viewport = {
  themeColor: "#22c55e",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaRegister />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
