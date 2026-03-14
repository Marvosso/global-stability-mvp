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
    "/admin",
    "/admin/:path*",
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

  if (pathname.startsWith("/admin")) {
    // Temporary bypass: allow unauthenticated admin access (set DISABLE_ADMIN_AUTH=true in env)
    const disableAdminAuth = process.env.DISABLE_ADMIN_AUTH === "true" || process.env.DISABLE_ADMIN_AUTH === "1";
    if (disableAdminAuth) {
      return NextResponse.next();
    }

    const user = await getSupabaseAuthUserForMiddleware(request);
    // When session is in localStorage only (default Supabase client), middleware sees no cookie.
    // Allow the request through so the client-side AdminGuard can read the session and redirect to login if needed.
    if (!user) {
      return NextResponse.next();
    }

    // Allow specific user IDs even without app_metadata role (e.g. ADMIN_ALLOW_USER_IDS=uuid1,uuid2)
    const allowList = process.env.ADMIN_ALLOW_USER_IDS;
    if (allowList && typeof allowList === "string") {
      const ids = allowList.split(",").map((id) => id.trim()).filter(Boolean);
      if (ids.includes(user.id)) {
        return NextResponse.next();
      }
    }

    const internalRole = getInternalRoleFromUser(user);
    if (internalRole !== "Admin" && internalRole !== "Reviewer") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

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
