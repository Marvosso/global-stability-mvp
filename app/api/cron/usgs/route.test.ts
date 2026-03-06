import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("@/lib/ingest/usgs", () => ({
  ingestUSGS: vi.fn(),
}));

const { ingestUSGS } = await import("@/lib/ingest/usgs");

const originalEnv = process.env;

describe("GET /api/cron/usgs", () => {
  beforeEach(() => {
    vi.mocked(ingestUSGS).mockResolvedValue({
      fetched: 1,
      processed: 1,
      skipped: 0,
    });
    process.env = { ...originalEnv, CRON_SECRET: "test-secret" };
  });

  it("returns 401 when x-cron-key is missing", async () => {
    const request = new NextRequest("http://localhost/api/cron/usgs", {
      method: "GET",
    });

    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(ingestUSGS).not.toHaveBeenCalled();
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
    const request = new NextRequest("http://localhost/api/cron/usgs", {
      method: "GET",
      headers: { "x-cron-key": "test-secret" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ fetched: 1, processed: 1, skipped: 0 });
    expect(body).toHaveProperty("processed");
    expect(body).toHaveProperty("skipped");
  });
});
