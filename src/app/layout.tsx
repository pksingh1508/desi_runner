import type { Metadata, Viewport } from "next";
import { Press_Start_2P, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

/** Chunky retro display face — titles, buttons, countdown numbers. */
const retro = Press_Start_2P({
  variable: "--font-retro",
  weight: "400",
  subsets: ["latin"],
});

 /** Tactical terminal mono — HUD stats, labels, body copy. */
const techMono = Share_Tech_Mono({
  variable: "--font-tech",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DESI RUN — Futuristic 3D Endless Runner",
  description:
    "Sprint through an infinite neon grid. Dodge, jump, slide and collect energy tokens in this browser-based 3D endless runner built with Next.js and Three.js.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070b09",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${retro.variable} ${techMono.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-hidden">{children}</body>
    </html>
  );
}
