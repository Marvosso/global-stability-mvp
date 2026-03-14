import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Methodology | GeoStability",
  description: "How GeoStability ingests, deduplicates, and publishes crisis events from USGS, GDACS, ReliefWeb, GDELT, and ACLED.",
};

export default function MethodologyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold">GeoStability</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">Home</Link>
            </Button>
            <Button variant="default" size="sm" asChild>
              <Link href="/map">Map</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="mb-2 text-2xl font-semibold">Methodology</h2>
        <p className="mb-8 text-muted-foreground">
          How we collect, process, and publish global crisis events.
        </p>

        <section className="mb-8">
          <h3 className="mb-3 text-lg font-medium">Data feeds (current status)</h3>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">USGS</strong> — Earthquakes; working. Auto-published, high confidence.</li>
            <li><strong className="text-foreground">GDACS</strong> — Natural disasters (cyclones, floods, etc.); working. Auto-published, high confidence.</li>
            <li><strong className="text-foreground">ReliefWeb</strong> — Humanitarian disasters; migrating to v2 API.</li>
            <li><strong className="text-foreground">GDELT</strong> — Conflict data (Ukraine, Iran, Israel, etc.) from daily export; filtered for EventRootCode 14–20 and actor mentions. Top-impact events auto-published (medium confidence).</li>
            <li><strong className="text-foreground">ACLED</strong> — Armed conflict (beta). Ukraine, Israel, Iran; last 7 days. Auto-published with category Armed Conflict. Requires ACLED API token (myACLED).</li>
          </ul>
          <p className="mt-2 text-sm font-medium text-foreground">Conflicts are now live (GDELT + ACLED beta).</p>
        </section>

        <section className="mb-8">
          <h3 className="mb-3 text-lg font-medium">Pipeline</h3>
          <p className="mb-2 text-sm text-muted-foreground">
            Ingest → Dedupe → Under Review → Manual or auto publish.
          </p>
          <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Ingest</strong> — Scripts and cron jobs fetch from each feed (USGS, GDACS, ReliefWeb, GDELT, ACLED).</li>
            <li><strong className="text-foreground">Dedupe</strong> — Events are matched by source URL and similarity to avoid duplicates.</li>
            <li><strong className="text-foreground">Under Review</strong> — New events enter as drafts with status Under Review (except trusted feeds that auto-publish).</li>
            <li><strong className="text-foreground">Publish</strong> — Reviewers approve or reject; USGS, GDACS, GDELT conflict (top-impact), and ACLED auto-publish. Published events appear on the map and public list.</li>
          </ol>
        </section>

        <section className="mb-8">
          <h3 className="mb-3 text-lg font-medium">Limitations</h3>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>Disasters (earthquakes, cyclones, etc.) are prioritized and generally higher quality.</li>
            <li>Conflict and protest data (e.g. GDELT) are noisier; filtering and tuning are ongoing.</li>
            <li>Confidence is based on source reliability and corroboration count; see footer note on the home and map pages.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h3 className="mb-3 text-lg font-medium">Plans</h3>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>ACLED integration (beta) is live; expand countries or date range as needed.</li>
            <li>Improve clustering so related events are grouped into incidents more reliably.</li>
            <li>Refine GDELT filters and confidence rules.</li>
          </ul>
        </section>

        <footer className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <Link href="/" className="underline hover:text-foreground">Back to home</Link>
          {" · "}
          Confidence based on source reliability and corroboration count.
        </footer>
      </main>
    </div>
  );
}
