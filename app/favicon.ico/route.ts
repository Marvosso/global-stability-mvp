import { NextResponse } from "next/server";

// Minimal 1x1 transparent PNG (67 bytes) so GET /favicon.ico returns 200
const FAVICON_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=",
  "base64"
);

export function GET() {
  return new NextResponse(FAVICON_PNG, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
