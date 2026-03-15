import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";

export const metadata: Metadata = {
  title: {
    default: "GeoStability API – Unified Real-Time Crisis Events",
    template: "%s | GeoStability",
  },
  description:
    "Query ACLED, GDELT, USGS, GDACS + clustering/confidence in one endpoint. Free tier: 500 calls/mo. Armed conflict, natural disasters, humanitarian events.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
