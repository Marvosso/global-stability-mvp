import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapTeaserSection } from "@/components/public/MapTeaserSection";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { parsePrimaryLocation } from "@/lib/eventCoordinates";
import { formatRelativeTime } from "@/lib/relativeTime";

export const revalidate = 300; // ISR: refresh every 5 minutes

type EventRow = {
  id: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  confidence_level: string | null;
  occurred_at: string | null;
  primary_location: string | null;
  country_code: string | null;
};

function locationLabel(row: EventRow): string {
  const coords = parsePrimaryLocation(row.primary_location);
  if (coords) return `Near ${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}`;
  if (row.country_code?.trim()) return row.country_code;
  return "Location data loading – check API for full coordinates";
}

function categoryBadgeClass(category: string | null): string {
  if (category === "Armed Conflict") return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
  if (category === "Natural Disaster") return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function confidenceBadgeClass(level: string | null): string {
  if (level === "High") return "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
  if (level === "Medium") return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
  if (level === "Low") return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
  return "bg-muted text-muted-foreground border-border";
}

async function getRecentEvents(): Promise<
  Array<EventRow & { source_count: number; first_source_url: string | null }>
> {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from("events")
      .select("id, title, summary, category, confidence_level, occurred_at, primary_location, country_code")
      .eq("status", "Published")
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(8);
    if (error || !rows?.length) return [];
    const events = rows as EventRow[];
    const ids = events.map((e) => e.id);
    const { data: links } = await supabaseAdmin
      .from("event_sources")
      .select("event_id, claim_url")
      .in("event_id", ids);
    const byEvent = new Map<string, { count: number; firstUrl: string | null }>();
    for (const id of ids) byEvent.set(id, { count: 0, firstUrl: null });
    const linkList = (links ?? []) as { event_id: string; claim_url: string | null }[];
    for (const l of linkList) {
      const cur = byEvent.get(l.event_id);
      if (!cur) continue;
      cur.count += 1;
      if (!cur.firstUrl && l.claim_url) cur.firstUrl = l.claim_url;
    }
    return events.map((e) => {
      const { count, firstUrl } = byEvent.get(e.id) ?? { count: 0, firstUrl: null };
      return { ...e, source_count: count, first_source_url: firstUrl };
    });
  } catch {
    return [];
  }
}

const FEATURES = [
  {
    title: "Mixed disasters & conflicts",
    description: "One API for ACLED, GDELT, USGS, GDACS and more. Armed conflict, natural disasters, and humanitarian events in a single query.",
  },
  {
    title: "Confidence scoring",
    description: "Every event includes confidence level and scoring so you can filter by reliability and prioritize high-signal data.",
  },
  {
    title: "Basic geo filter",
    description: "Filter by country code or lat/lon + radius (km). Build maps, regional dashboards, or location-based alerts.",
  },
];

const PRICING = [
  { name: "Free", calls: "500 calls/mo", price: "$0", cta: "Get API key" },
  { name: "Pro", calls: "Unlimited basic", price: "$9/mo", cta: "Coming soon" },
  { name: "Enterprise", calls: "Bulk & custom", price: "Contact", cta: "Contact us" },
];

const CURL_EXAMPLE = `curl 'https://geostability.com/api/events?limit=10'`;

const SAMPLE_RESPONSE = {
  data: [
    {
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Armed clash in region X",
      category: "Armed Conflict",
      subtype: "Armed clash",
      severity: "High",
      confidence: "Medium",
      occurred_at: "2025-03-10T14:00:00.000Z",
      lat: 50.45,
      lon: 30.52,
      sources: ["https://example.com/source1"],
      feed_key: "gdelt_events",
      summary:
        "Multiple corroborating reports of missile strike from Ukrainian and international media. High confidence due to ACLED verification.",
    },
  ],
  total: 1,
  returned: 1,
};

export default async function HomePage() {
  const recentEvents = await getRecentEvents();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold">GeoStability</h1>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/methodology">Methodology</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="#quick-start">Docs</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin">Admin</Link>
            </Button>
            <Button variant="default" size="sm" asChild>
              <Link href="/login?redirect=/dashboard">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <section className="mb-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            GeoStability API – Unified Real-Time Crisis Events
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Query ACLED, GDELT, USGS, GDACS + clustering/confidence in one endpoint. Free tier available.
          </p>
          <div className="mt-6">
            <Button size="lg" asChild>
              <Link href="/login?redirect=/dashboard">Get started</Link>
            </Button>
          </div>
        </section>

        <section className="mb-16">
          <h3 className="mb-6 text-xl font-semibold">Features</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <MapTeaserSection />

        <section className="mb-16">
          <h3 className="mb-6 text-xl font-semibold">Pricing</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {PRICING.map((p) => (
              <Card key={p.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="text-2xl font-semibold">{p.price}</p>
                  <p className="text-sm text-muted-foreground">{p.calls}</p>
                </CardHeader>
                <CardContent>
                  <Button variant={p.name === "Free" ? "default" : "outline"} size="sm" className="w-full" asChild>
                    <Link href={p.name === "Free" ? "/login?redirect=/dashboard" : "#"}>{p.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h3 className="mb-2 text-xl font-semibold">What&apos;s happening right now – sample from the API</h3>
          <p className="mb-6 text-sm text-muted-foreground">Recent Events – Live Sample (refreshes every 5 min)</p>
          {recentEvents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No published events yet. Run ingestion or seed to see live samples here.
              </CardContent>
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {recentEvents.map((event) => (
                <Card key={event.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${categoryBadgeClass(event.category)}`}
                      >
                        {event.category ?? "Event"}
                      </span>
                      <span
                        className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(event.confidence_level)}`}
                      >
                        {event.confidence_level ?? "Medium"}
                      </span>
                    </div>
                    <CardTitle className="mt-2 text-base leading-tight">{event.title ?? "Untitled"}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(event.occurred_at)} · {locationLabel(event)}
                    </p>
                  </CardHeader>
                  <CardContent className="mt-auto pt-0">
                    {event.summary && (
                      <p className="mb-3 line-clamp-3 text-sm text-muted-foreground">{event.summary}</p>
                    )}
                    {event.source_count > 0 && event.first_source_url ? (
                      <a
                        href={event.first_source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline hover:no-underline"
                      >
                        Source count: {event.source_count}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Source count: {event.source_count}</span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </ul>
          )}
        </section>

        <section id="quick-start" className="mb-16 scroll-mt-8">
          <h3 className="mb-4 text-xl font-semibold">API reference</h3>

          <h4 className="mb-2 mt-6 text-base font-medium">Events</h4>
          <p className="mb-3 text-sm text-muted-foreground">
            Sign in, generate an API key, then call the events endpoint. Each event includes <code className="rounded bg-muted px-1">summary</code> (the &quot;why&quot; explanation). Anonymous requests are rate-limited; use a key for your free tier quota.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm">
            <code>{CURL_EXAMPLE}</code>
          </pre>
          <p className="mt-3 text-xs font-medium text-muted-foreground">Sample response</p>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-xs">
            <code>{JSON.stringify(SAMPLE_RESPONSE, null, 2)}</code>
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Params:{" "}
            <code className="rounded bg-muted px-1">category</code>,{" "}
            <code className="rounded bg-muted px-1">country</code>,{" "}
            <code className="rounded bg-muted px-1">since</code>/<code className="rounded bg-muted px-1">until</code>,{" "}
            <code className="rounded bg-muted px-1">lat</code>,{" "}
            <code className="rounded bg-muted px-1">lon</code>,{" "}
            <code className="rounded bg-muted px-1">radius_km</code>,{" "}
            <code className="rounded bg-muted px-1">limit</code> (default 20, max 100),{" "}
            <code className="rounded bg-muted px-1">offset</code>. Optional: <code className="rounded bg-muted px-1">X-API-Key</code> for quota.
          </p>

          <h4 className="mb-2 mt-6 text-base font-medium">Clusters (heat-map aggregation)</h4>
          <p className="mb-2 text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1">GET /api/clusters</code> — aggregated buckets for heat-map or embed use. Published events only.
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Params: <code className="rounded bg-muted px-1">timeline</code>=<code className="rounded bg-muted px-1">7d</code>|<code className="rounded bg-muted px-1">30d</code>,{" "}
            <code className="rounded bg-muted px-1">resolution</code>=<code className="rounded bg-muted px-1">coarse</code>|<code className="rounded bg-muted px-1">medium</code>|<code className="rounded bg-muted px-1">fine</code>,{" "}
            <code className="rounded bg-muted px-1">category</code> (optional).
          </p>
          <p className="text-xs text-muted-foreground">
            Response: array of{" "}
            <code className="rounded bg-muted px-1">{"{ lat, lon, count, avg_confidence, dominant_category, events_sample }"}</code> (events_sample = up to 3 event ids).
          </p>
        </section>

        <section className="mb-12 text-center">
          <p className="text-muted-foreground">Ready to build? Create an account and generate your API key.</p>
          <Button className="mt-3" asChild>
            <Link href="/login?redirect=/dashboard">Sign up / Log in</Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-border bg-card py-6">
        <div className="mx-auto max-w-4xl px-4 text-center text-sm text-muted-foreground">
          <Link href="/methodology" className="underline hover:text-foreground">Methodology</Link>
          {" · "}
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">GitHub</a>
          {" · "}
          <a href="https://x.com/Vosso860" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">X @Vosso860</a>
        </div>
      </footer>
    </div>
  );
}
