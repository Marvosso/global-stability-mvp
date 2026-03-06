import type { User } from "@supabase/supabase-js";

/**
 * Reads role from user.app_metadata.role only. No user_metadata fallback.
 * Returns null if user is null or role is missing/not a string.
 */
export function getRoleFromUser(user: User | null): string | null {
  if (!user?.app_metadata) return null;
  const role = user.app_metadata.role;
  return typeof role === "string" && role.length > 0 ? role : null;
}
