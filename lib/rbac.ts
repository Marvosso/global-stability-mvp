import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";

export type InternalRole = "Admin" | "Reviewer" | "AI";

/** Feature tier for premium gating (Phase 15D). Stored in user.app_metadata.user_role; default "free". */
export type UserRole = "free" | "premium" | "enterprise";

export type AuthContextAdmin = { userId: string; role: "Admin" };
export type AuthContextReviewer = { userId: string; role: "Admin" | "Reviewer" };
export type AuthContextAI = { userId: string; role: "AI" };

const USER_ROLE_MAP: Record<string, UserRole> = {
  free: "free",
  premium: "premium",
  enterprise: "enterprise",
};

function userRoleFromUser(user: User): UserRole {
  const raw = (user.app_metadata?.user_role as string) ?? null;
  if (!raw || typeof raw !== "string") return "free";
  const canonical = USER_ROLE_MAP[raw.trim().toLowerCase()];
  return canonical ?? "free";
}

const ROLES: InternalRole[] = ["Admin", "Reviewer", "AI"]; // canonical role set (ROLE_MAP keys match)

/** Thrown when unauthenticated or role is missing from app_metadata. */
export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Maps app_metadata.role (any case) to InternalRole. Supabase may store "ADMIN" etc. */
const ROLE_MAP: Record<string, InternalRole> = {
  admin: "Admin",
  reviewer: "Reviewer",
  ai: "AI",
};

function roleFromUser(user: User): InternalRole | null {
  const raw = (user.app_metadata?.role as string) ?? null;
  if (!raw || typeof raw !== "string") return null;
  const canonical = ROLE_MAP[raw.trim().toLowerCase()];
  return canonical ?? null;
}

/** Exported for middleware: resolve Supabase user from request (cookie or Bearer). */
export async function getSupabaseAuthUserForMiddleware(
  request: NextRequest
): Promise<User | null> {
  return getSupabaseAuthUser(request);
}

/** Exported for middleware: get feature tier from user app_metadata. */
export function getUserRoleFromUser(user: User): UserRole {
  return userRoleFromUser(user);
}

/** Exported for middleware: get internal role from user app_metadata (no extra Supabase call). */
export function getInternalRoleFromUser(user: User): InternalRole | null {
  return roleFromUser(user);
}

/**
 * Single place for normalizing the access token for RBAC.
 * All token sources (Authorization header and auth cookie) must be passed through this before calling Supabase auth.
 * Strips optional "Bearer " prefix and trims; returns null for empty/missing.
 */
function getBearerToken(authHeader: string | null): string | null {
  if (authHeader == null || authHeader === "") return null;
  const trimmed = authHeader.trim();
  if (trimmed.startsWith("Bearer ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed;
}

async function getSupabaseAuthUser(request: NextRequest): Promise<User | null> {
  let accessToken: string | null = null;
  let tokenSource: 'header' | 'cookie' | 'none' = 'none';

  const authHeader = request.headers.get("authorization");
  accessToken = getBearerToken(authHeader);
  if (accessToken) tokenSource = 'header';

  if (!accessToken) {
    const cookieStore = await cookies();
    const all = cookieStore.getAll();
    const authCookie = all.find((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
    if (authCookie?.value) {
      try {
        const parsed = JSON.parse(authCookie.value) as { access_token?: string };
        accessToken = getBearerToken(parsed.access_token ?? null);
        if (accessToken) tokenSource = 'cookie';
      } catch {
        // ignore invalid cookie
      }
    }
  }

  if (!accessToken) return null;

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Resolves the current user from Supabase auth (JWT from Authorization header or auth cookie).
 * Returns null if unauthenticated. Use for endpoints that allow any logged-in user (e.g. watchlists).
 */
export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ userId: string } | null> {
  const user = await getSupabaseAuthUser(request);
  if (!user) return null;
  return { userId: user.id };
}

/**
 * Ensures the request is authenticated. Throws 401 if unauthenticated.
 * Use for endpoints that allow any logged-in user (e.g. watchlists).
 */
export async function requireAuth(request: NextRequest): Promise<{ userId: string }> {
  const ctx = await getAuthenticatedUser(request);
  if (!ctx) throw new UnauthorizedError("Unauthorized");
  return ctx;
}

/**
 * Returns the authenticated user and their feature tier (user_role).
 * Throws 401 if unauthenticated. Use before requirePremium to get both auth and tier.
 */
export async function getAuthenticatedUserWithRole(
  request: NextRequest
): Promise<{ userId: string; user_role: UserRole }> {
  const user = await getSupabaseAuthUser(request);
  if (!user) throw new UnauthorizedError("Unauthorized");
  return { userId: user.id, user_role: userRoleFromUser(user) };
}

/**
 * Ensures the request is authenticated and the user has at least premium tier (premium or enterprise).
 * Throws 401 if unauthenticated, 403 if user_role is "free".
 * Use for premium-only endpoints (alerts, dashboards, API export).
 */
export async function requirePremium(
  request: NextRequest
): Promise<{ userId: string; user_role: UserRole }> {
  const user = await getSupabaseAuthUser(request);
  if (!user) throw new UnauthorizedError("Unauthorized");
  const user_role = userRoleFromUser(user);
  // Admin and Reviewer bypass the premium gate — they have full access regardless of feature tier
  const internalRole = roleFromUser(user);
  if (user_role === "free" && internalRole !== "Admin" && internalRole !== "Reviewer") {
    throw Object.assign(new Error("Upgrade required"), {
      status: 403 as const,
      code: "UPGRADE_REQUIRED" as const,
    });
  }
  return { userId: user.id, user_role };
}

/**
 * Resolves the current user and role from Supabase auth (JWT from Authorization header or auth cookie).
 * Returns null if unauthenticated or role is not Admin | Reviewer | AI.
 */
export async function getUserRole(
  request: NextRequest
): Promise<{ userId: string; role: InternalRole } | null> {
  const user = await getSupabaseAuthUser(request);
  if (!user) return null;
  const role = roleFromUser(user);
  if (!role) return null;
  return { userId: user.id, role };
}

/**
 * Ensures the request is authenticated and the caller has Admin role.
 * Throws 401 if unauthenticated, 403 if not Admin. Returns narrowed context.
 */
export async function requireAdmin(request: NextRequest): Promise<AuthContextAdmin> {
  const ctx = await getUserRole(request);
  if (!ctx) throw new UnauthorizedError("Unauthorized");
  if (ctx.role !== "Admin") throw Object.assign(new Error("Forbidden"), { status: 403 as const });
  return { userId: ctx.userId, role: "Admin" };
}

/**
 * Ensures the request is authenticated and the caller has at least Reviewer role (Admin or Reviewer).
 * Throws 401 if unauthenticated, 403 if not Admin or Reviewer. Returns narrowed context.
 */
export async function requireReviewer(request: NextRequest): Promise<AuthContextReviewer> {
  const ctx = await getUserRole(request);
  if (!ctx) throw new UnauthorizedError("Unauthorized");
  if (ctx.role !== "Admin" && ctx.role !== "Reviewer")
    throw Object.assign(new Error("Forbidden"), { status: 403 as const });
  return { userId: ctx.userId, role: ctx.role };
}

/**
 * Ensures the request is authenticated and the caller has AI role.
 * Throws 401 if unauthenticated, 403 if not AI. Returns narrowed context.
 */
export async function requireAI(request: NextRequest): Promise<AuthContextAI> {
  const ctx = await getUserRole(request);
  if (!ctx) throw new UnauthorizedError("Unauthorized");
  if (ctx.role !== "AI") throw Object.assign(new Error("Forbidden"), { status: 403 as const });
  return { userId: ctx.userId, role: "AI" };
}
