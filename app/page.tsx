"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const CURL_EXAMPLE = `curl 'https://geostability.com/api/events?category=Armed%20Conflict&limit=10' \\
  -H 'X-API-Key: yourkey'`;

export default function HomePage() {
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

        <section id="quick-start" className="mb-16 scroll-mt-8">
          <h3 className="mb-4 text-xl font-semibold">API reference</h3>

          <h4 className="mb-2 mt-6 text-base font-medium">Events</h4>
          <p className="mb-3 text-sm text-muted-foreground">
            Sign in, generate an API key, then call the events endpoint. Anonymous requests are rate-limited; use a key for your free tier quota.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm">
            <code>{CURL_EXAMPLE}</code>
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Replace <code className="rounded bg-muted px-1">yourkey</code> with your key. Params:{" "}
            <code className="rounded bg-muted px-1">category</code>,{" "}
            <code className="rounded bg-muted px-1">country</code>,{" "}
            <code className="rounded bg-muted px-1">since</code>/<code className="rounded bg-muted px-1">until</code>,{" "}
            <code className="rounded bg-muted px-1">lat</code>,{" "}
            <code className="rounded bg-muted px-1">lon</code>,{" "}
            <code className="rounded bg-muted px-1">radius_km</code>,{" "}
            <code className="rounded bg-muted px-1">limit</code> (max 100).
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
