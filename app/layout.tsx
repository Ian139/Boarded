import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/shared/BottomNav";
import { LiquidTransition } from "@/components/shared/LiquidTransition";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers/Providers";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});


const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boarded - Digital Route Setter",
  description: "Document and share your climbing routes",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ea" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1a17" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <Providers>
          {children}
          <BottomNav />
          <LiquidTransition />
          <Toaster />
          <Analytics />
          <Script id="sw-register" strategy="afterInteractive">{`
            if ('serviceWorker' in navigator) {
              const version = '${process.env.NEXT_PUBLIC_APP_VERSION || 'dev'}';
              window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js?v=' + encodeURIComponent(version)).catch(() => {});
              });
            }
          `}</Script>
        </Providers>
      </body>
    </html>
  );
}
