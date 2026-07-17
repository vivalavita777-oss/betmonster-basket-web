import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/Shell";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Basket Monster",
  description: "Basketball match center, live signals, recommendations, and performance.",
  manifest: "/manifest.webmanifest",
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
