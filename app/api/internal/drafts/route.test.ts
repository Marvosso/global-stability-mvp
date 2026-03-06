import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

// Chainable Supabase mock: all methods return the same chain; awaiting it resolves to { data, error }.
function createSupabaseMock(overrides: { data?: unknown; error?: unknown } = {}) {
  const result = { data: overrides.data ?? null, error: overrides.error ?? null };
  const chain = {
    from: () => chain,
    select: () => chain,
    insert: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(result),
    rpc: () => Promise.resolve(result),
    then(resolve: (v: typeof result) => void) {
      resolve(result);
    },
    catch() {
      return Promise.resolve(result);
    },
  };
  return chain;
}

vi.mock("../../_lib/db", () => ({
  supabaseAdmin: createSupabaseMock(),
}));

vi.mock("../../../../lib/rbac", () => ({
  getUserRole: vi.fn(),
}));

const { getUserRole } = await import("../../../../lib/rbac");

describe("POST /api/internal/drafts", () => {
  beforeEach(() => {
    vi.mocked(getUserRole).mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const body = {
      title: "Test",
      summary: "Summary",
      category: "Armed Conflict",
      primary_classification: "Verified Event",
      severity: "Low",
      confidence_level: "Low",
    };
    const request = new NextRequest("http://localhost/api/internal/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
