import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/ingest/gdacs", () => ({
  fetchAndNormalizeGdacs: vi.fn(),
  GDACS_FEED_KEY: "gdacs_rss",
}));

const { fetchAndNormalizeGdacs } = await import("@/lib/ingest/gdacs");

const originalEnv = process.env;

describe("GET /api/cron/gdacs", () => {
  beforeEach(() => {
    vi.mocked(fetchAndNormalizeGdacs).mockResolvedValue({
      items: [
        {
          feed_key: "gdacs_rss",
          source_name: "GDACS",
          source_url: "https://www.gdacs.org/",
          title: "Test event",
          summary: "Test",
        },
      ],
      fetched: 1,
    });
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
      INGEST_API_KEY: "test-ingest-key",
      GDACS_RSS_URL: "https://www.gdacs.org/xml/rss.xml",
    };
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns 401 when x-cron-key is missing", async () => {
    const request = new NextRequest("http://localhost/api/cron/gdacs", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(fetchAndNormalizeGdacs).not.toHaveBeenCalled();
  });

  it("returns 503 when GDACS_RSS_URL is not set", async () => {
    process.env.GDACS_RSS_URL = "";

    const request = new NextRequest("http://localhost/api/cron/gdacs", {
      method: "GET",
      headers: { "x-cron-key": "test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(503);
  });

  it("accepts Authorization Bearer for Vercel cron", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ processed: 1, skipped: 0 })),
    });

    const request = new NextRequest("http://localhost/api/cron/gdacs", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ fetched: 1, feed_key: "gdacs_rss" });
  });
});
