import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/ingest/gdacs", () => ({
  ingestGDACS: vi.fn(),
}));

const { ingestGDACS } = await import("@/lib/ingest/gdacs");

const originalEnv = process.env;

describe("GET /api/cron/gdacs", () => {
  beforeEach(() => {
    vi.mocked(ingestGDACS).mockResolvedValue({
      fetched: 1,
      processed: 1,
      skipped: 0,
    });
    process.env = {
      ...originalEnv,
      CRON_SECRET: "test-secret",
      GDACS_RSS_URL: "https://www.gdacs.org/xml/rss.xml",
    };
  });

  it("returns 401 when x-cron-key is missing", async () => {
    const request = new NextRequest("http://localhost/api/cron/gdacs", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(ingestGDACS).not.toHaveBeenCalled();
  });

  it("returns 503 when GDACS_RSS_URL is not set", async () => {
    process.env.GDACS_RSS_URL = "";
    vi.mocked(ingestGDACS).mockRejectedValue(
      new Error("GDACS_RSS_URL is required and must be an HTTP(S) URL")
    );

    const request = new NextRequest("http://localhost/api/cron/gdacs", {
      method: "GET",
      headers: { "x-cron-key": "test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(503);
  });

  it("accepts Authorization Bearer for Vercel cron", async () => {
    const request = new NextRequest("http://localhost/api/cron/gdacs", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ fetched: 1, processed: 1, skipped: 0 });
  });
});
