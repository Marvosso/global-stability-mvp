import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/auth/SessionProvider";

export const metadata: Metadata = {
  title: {
    default: "GeoStability - Real-Time Global Crisis Map",
    template: "%s | GeoStability",
  },
  description:
    "Real-time global crisis map: natural disasters, conflict, and humanitarian events from USGS, GDACS, ReliefWeb, and GDELT. Explore published events and methodology.",
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
