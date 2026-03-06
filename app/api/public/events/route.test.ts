import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

vi.mock("../../_lib/db", () => {
  const publishedOnly = [
    {
      id: "ev-published-1",
      status: "Published",
      title: "Published One",
      summary: "Summary",
      details: null,
      category: "Armed Conflict",
      subtype: null,
      primary_classification: "Verified Event",
      secondary_classification: null,
      severity: "Low",
      confidence_level: "Low",
      occurred_at: null,
      ended_at: null,
      primary_location: null,
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    },
    {
      id: "ev-published-2",
      status: "Published",
      title: "Published Two",
      summary: "Summary",
      details: null,
      category: "Military Posture",
      subtype: null,
      primary_classification: "Verified Event",
      secondary_classification: null,
      severity: "High",
      confidence_level: "High",
      occurred_at: null,
      ended_at: null,
      primary_location: null,
      created_at: "2025-01-04T00:00:00Z",
      updated_at: "2025-01-04T00:00:00Z",
    },
  ];
  const emptyResult = { data: [] as typeof publishedOnly, error: null as Error | null };
  const eventsResult = { data: publishedOnly, error: null as Error | null };

  const chainEvents = {
    from: () => chainEvents,
    select: () => chainEvents,
    eq: () => chainEvents,
    order: () => chainEvents,
    range: () => chainEvents,
    in: () => chainEvents,
    then(resolve: (v: { data: typeof publishedOnly; error: null }) => void) {
      resolve(eventsResult);
    },
    catch() {
      return Promise.resolve(eventsResult);
    },
  };

  const chainEmpty = {
    from: () => chainEmpty,
    select: () => chainEmpty,
    eq: () => chainEmpty,
    order: () => chainEmpty,
    range: () => chainEmpty,
    in: () => chainEmpty,
    then(resolve: (v: typeof emptyResult) => void) {
      resolve(emptyResult);
    },
    catch() {
      return Promise.resolve(emptyResult);
    },
  };

  return {
    supabaseAdmin: {
      from(table: string) {
        return table === "events" ? chainEvents : chainEmpty;
      },
    },
  };
});

describe("GET /api/public/events", () => {
  it("returns only Published events when dataset has mixed statuses", async () => {
    const request = new NextRequest("http://localhost/api/public/events");

    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body.every((event: { status: string }) => event.status === "Published")).toBe(true);
    expect(body.some((e: { status: string }) => e.status === "UnderReview" || e.status === "Rejected")).toBe(
      false
    );
  });
});
