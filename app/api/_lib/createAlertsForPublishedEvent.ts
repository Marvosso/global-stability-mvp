import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  watchlistEntryMatchesEvent,
  type EventSnapshotForEntryMatching,
  type WatchlistEntryRow,
} from "@/lib/alertMatching";
import { sendAlertEmail } from "@/lib/sendAlertEmail";

/**
 * When an event transitions to Published, find Phase 15A watchlist entries that match
 * (country, category, or actor) and create one alert per (user_id, event_id, watchlist_id).
 * When an entry has email_notifications enabled, sends an email for newly created alerts.
 */
export async function createAlertsForPublishedEvent(eventId: string): Promise<number> {
  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, title, category, country_code, primary_location, severity")
    .eq("id", eventId)
    .single();

  if (eventError || !event) return 0;

  const snapshot: EventSnapshotForEntryMatching = {
    category: event.category as string,
    country_code: event.country_code ?? null,
  };

  // Actor names: from event_actors -> actors.name and event_claims.actor_name
  const actorNames: string[] = [];

  const { data: eventActors } = await supabaseAdmin
    .from("event_actors")
    .select("actor_id")
    .eq("event_id", eventId);
  const actorIds = [...new Set((eventActors ?? []).map((r) => r.actor_id))];
  if (actorIds.length > 0) {
    const { data: actors } = await supabaseAdmin
      .from("actors")
      .select("name")
      .in("id", actorIds);
    for (const a of actors ?? []) {
      if (a.name && String(a.name).trim()) actorNames.push(String(a.name).trim());
    }
  }

  const { data: claims } = await supabaseAdmin
    .from("event_claims")
    .select("actor_name")
    .eq("event_id", eventId);
  for (const c of claims ?? []) {
    const name = c.actor_name;
    if (name && String(name).trim()) actorNames.push(String(name).trim());
  }

  const { data: entries, error: wlError } = await supabaseAdmin
    .from("user_watchlists")
    .select("id, user_id, watch_type, watch_value, email_notifications");

  if (wlError || !entries?.length) return 0;

  const matching = entries.filter((row) =>
    watchlistEntryMatchesEvent(snapshot, actorNames, row as WatchlistEntryRow)
  ) as (WatchlistEntryRow & { email_notifications?: boolean })[];

  if (matching.length === 0) return 0;

  const { data: existingAlerts } = await supabaseAdmin
    .from("alerts")
    .select("user_id, watchlist_id")
    .eq("event_id", eventId);

  const existingKey = (uid: string, wid: string) => `${uid}:${wid}`;
  const existingSet = new Set(
    (existingAlerts ?? []).map((a) => existingKey(a.user_id, a.watchlist_id))
  );

  const rows = matching.map((w) => ({
    user_id: w.user_id,
    event_id: eventId,
    watchlist_id: w.id,
  }));

  const newRows = rows.filter((r) => !existingSet.has(existingKey(r.user_id, r.watchlist_id)));

  const { error: insertError } = await supabaseAdmin.from("alerts").upsert(rows, {
    onConflict: "user_id,event_id,watchlist_id",
    ignoreDuplicates: true,
  });

  if (insertError) return 0;

  // Phase 15B: one row per user-event in user_alerts (ignore duplicates)
  const userIdsForUserAlerts = [...new Set(matching.map((w) => w.user_id))];
  const userAlertRows = userIdsForUserAlerts.map((uid) => ({
    user_id: uid,
    event_id: eventId,
    alert_type: "watchlist_match",
    seen: false,
  }));
  if (userAlertRows.length > 0) {
    await supabaseAdmin.from("user_alerts").upsert(userAlertRows, {
      onConflict: "user_id,event_id",
      ignoreDuplicates: true,
    });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const mapLink = `${baseUrl}/map?eventId=${eventId}`;
  const eventTitle = (event.title as string)?.trim() || "Event";
  const location = event.primary_location as string | null;
  const severity = event.severity as string;

  const userIds = [...new Set(newRows.map((r) => r.user_id))];
  const userEmailCache = new Map<string, string>();
  for (const uid of userIds) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(uid);
    if (userData?.user?.email) userEmailCache.set(uid, userData.user.email);
  }

  for (const row of newRows) {
    const w = matching.find((m) => m.id === row.watchlist_id);
    if (!w?.email_notifications) continue;
    const to = userEmailCache.get(row.user_id);
    if (!to) continue;
    await sendAlertEmail(to, {
      eventTitle,
      location,
      severity,
      mapLink,
    });
  }

  return rows.length;
}
