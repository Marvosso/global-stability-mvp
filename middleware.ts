import { NextRequest, NextResponse } from "next/server";
import { check } from "./lib/rateLimit";
import { rateLimitExceeded, upgradeRequired } from "./lib/apiError";
import {
  getSupabaseAuthUserForMiddleware,
  getUserRoleFromUser,
  getInternalRoleFromUser,
} from "./lib/rbac";

const PREMIUM_PATHS = [
  "/api/alerts",
  "/api/user/alerts",
  "/api/user/dashboards",
  "/api/user/export",
];

function isPremiumPath(pathname: string): boolean {
  return PREMIUM_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export const config = {
  matcher: [
    "/api/public/:path*",
    "/api/alerts/:path*",
    "/api/user/alerts/:path*",
    "/api/user/dashboards/:path*",
    "/api/user/export",
  ],
};

function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const ua = request.headers.get("user-agent") ?? "unknown";
  return `anonymous:${ua.slice(0, 128)}`;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/public/")) {
    const key = getClientKey(request);
    const { allowed, resetAtMs } = check(key);
    if (!allowed) {
      const retryAfterSeconds = Math.max(0, (resetAtMs - Date.now()) / 1000);
      return rateLimitExceeded(retryAfterSeconds);
    }
    return NextResponse.next();
  }

  if (isPremiumPath(pathname)) {
    const user = await getSupabaseAuthUserForMiddleware(request);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const user_role = getUserRoleFromUser(user);
    const internalRole = getInternalRoleFromUser(user);
    // Admin and Reviewer bypass the premium gate
    if (user_role === "free" && internalRole !== "Admin" && internalRole !== "Reviewer") {
      return upgradeRequired();
    }
  }

  return NextResponse.next();
}
