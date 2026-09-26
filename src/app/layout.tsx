import type { Metadata, Viewport } from "next";
import { Baloo_2, Poppins, Yatra_One } from "next/font/google";
// Tailwind + @theme first, then the UI partials in cascade order.
import "./globals.css";
import "@/components/ui/styles/tokens.css";
import "@/components/ui/styles/motion.css";
import "@/components/ui/styles/primitives.css";
import "@/components/ui/styles/menu.css";
import "@/components/ui/styles/hud.css";
import "@/components/ui/styles/overlays.css";
import "@/components/ui/styles/reduced-motion.css";

/** Chunky rounded display face (Latin + Devanagari) — titles, numbers, buttons. */
const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  display: "swap",
});

/** Clean UI face (Latin + Devanagari) — labels, body copy, descriptions. */
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

/** Decorative Devanagari face — the "देसी रन" logo and Hindi accents. */
const yatra = Yatra_One({
  variable: "--font-yatra",
  weight: "400",
  subsets: ["devanagari"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DESI RUN · देसी रन — 3D Indian Street Runner",
  description:
    "Bhaago through Chandni Chowk, the Pink City, Mumbai monsoon and Diwali night. Dodge cows, autos and chai stalls, grab CHUMBAK and CHAI BOOST, fill your JOSH meter and ride the Diwali rocket in this browser 3D endless runner.",
};

export const viewport: Viewport = {
  themeColor: "#1a1440",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${baloo.variable} ${poppins.variable} ${yatra.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-hidden">{children}</body>
    </html>
  );
}
