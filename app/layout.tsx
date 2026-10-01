import type { Metadata, Viewport } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { siteConfig } from "../lib/site";
import Providers from "./providers";

const bodyFont = DM_Sans({ subsets: ["latin"], display: "swap", variable: "--font-body" });
const displayFont = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Sasta AI — The internet, but without the tab hoarding.",
    template: "%s | Sasta AI",
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  generator: "Next.js",
  keywords: [
    "AI search",
    "web research assistant",
    "answer engine",
    "web scraper AI",
    "search and summarize",
    "verified web answers",
  ],
  authors: [{ name: siteConfig.name }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: "technology",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/brand-mark.svg", type: "image/svg+xml" },
      { url: "/brand-mark.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: "/brand-mark.svg",
  },
  openGraph: {
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: "Sasta AI — The internet, but without the tab hoarding.",
    description: siteConfig.description,
    images: [
      {
        url: "/logo.svg",
        width: 1120,
        height: 280,
        alt: "Sasta AI — The internet, but without the tab hoarding.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sasta AI — The internet, but without the tab hoarding.",
    description: siteConfig.description,
    images: ["/logo.svg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f8f8fb",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
