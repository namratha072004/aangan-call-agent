import type { Metadata, Viewport } from "next";
import { Nunito_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const display = Playfair_Display({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const body = Nunito_Sans({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = { title: "Aangan Calls", description: "Aangan Studio AI call agent dashboard" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
