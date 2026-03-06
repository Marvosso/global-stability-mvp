import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/ingest/usgs", () => ({
  fetchAndNormalizeUsgs: vi.fn(),
  USGS_FEED_KEY: "usgs_eq",
}));

const { fetchAndNormalizeUsgs } = await import("@/lib/ingest/usgs");

const originalEnv = process.env;

describe("GET /api/cron/usgs", () => {
  beforeEach(() => {
    vi.mocked(fetchAndNormalizeUsgs).mockResolvedValue({
      items: [
        {
          feed_key: "usgs_eq",
          source_name: "USGS",
          source_url: "https://earthquake.usgs.gov/earthquakes/eventpage/abc",
          title: "M 4.5 - Test",
          summary: "M 4.5 - Test location",
        },
      ],
      fetched: 1,
    });
    process.env = { ...originalEnv, CRON_SECRET: "test-secret", INGEST_API_KEY: "test-ingest-key" };
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns 401 when x-cron-key is missing", async () => {
    const request = new NextRequest("http://localhost/api/cron/usgs", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(fetchAndNormalizeUsgs).not.toHaveBeenCalled();
  });

  it("returns 401 when x-cron-key is wrong", async () => {
    const request = new NextRequest("http://localhost/api/cron/usgs", {
      method: "GET",
      headers: { "x-cron-key": "wrong" },
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns 200 with fetched/processed/skipped when authorized", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ processed: 1, skipped: 0 })),
    });

    const request = new NextRequest("http://localhost/api/cron/usgs", {
      method: "GET",
      headers: { "x-cron-key": "test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ fetched: 1, feed_key: "usgs_eq" });
    expect(body).toHaveProperty("processed");
    expect(body).toHaveProperty("skipped");
  });
});
