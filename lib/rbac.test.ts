import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  requireAdmin,
  requireReviewer,
  requireAI,
  UnauthorizedError,
} from "./rbac";

const { mockGetUser } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/app/api/_lib/db", () => ({
  supabaseAdmin: {
    auth: {
      getUser: mockGetUser,
    },
  },
}));

function requestWithBearer(token: string): NextRequest {
  return new NextRequest("http://localhost", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function userWithRole(id: string, role: "Admin" | "Reviewer" | "AI"): User {
  return {
    id,
    app_metadata: { role },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });

  it("resolves with Admin context when role is Admin", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "Admin") },
      error: null,
    });
    const request = requestWithBearer("token");

    const ctx = await requireAdmin(request);

    expect(ctx).toEqual({ userId: "user-1", role: "Admin" });
  });

  it("throws 403 when role is Reviewer", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "Reviewer") },
      error: null,
    });
    const request = requestWithBearer("token");

    await expect(requireAdmin(request)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when role is AI", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "AI") },
      error: null,
    });
    const request = requestWithBearer("token");

    await expect(requireAdmin(request)).rejects.toMatchObject({ status: 403 });
  });

  it("throws UnauthorizedError when user is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const request = requestWithBearer("token");

    await expect(requireAdmin(request)).rejects.toThrow(UnauthorizedError);
    await expect(requireAdmin(request)).rejects.toMatchObject({ status: 401 });
  });
});

describe("requireReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });

  it("resolves with Admin context when role is Admin", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "Admin") },
      error: null,
    });
    const request = requestWithBearer("token");

    const ctx = await requireReviewer(request);

    expect(ctx).toEqual({ userId: "user-1", role: "Admin" });
  });

  it("resolves with Reviewer context when role is Reviewer", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "Reviewer") },
      error: null,
    });
    const request = requestWithBearer("token");

    const ctx = await requireReviewer(request);

    expect(ctx).toEqual({ userId: "user-1", role: "Reviewer" });
  });

  it("throws 403 when role is AI", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "AI") },
      error: null,
    });
    const request = requestWithBearer("token");

    await expect(requireReviewer(request)).rejects.toMatchObject({ status: 403 });
  });

  it("throws UnauthorizedError when user is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const request = requestWithBearer("token");

    await expect(requireReviewer(request)).rejects.toThrow(UnauthorizedError);
    await expect(requireReviewer(request)).rejects.toMatchObject({ status: 401 });
  });
});

describe("requireAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  });

  it("resolves with AI context when role is AI", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "AI") },
      error: null,
    });
    const request = requestWithBearer("token");

    const ctx = await requireAI(request);

    expect(ctx).toEqual({ userId: "user-1", role: "AI" });
  });

  it("throws 403 when role is Admin", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "Admin") },
      error: null,
    });
    const request = requestWithBearer("token");

    await expect(requireAI(request)).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when role is Reviewer", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: userWithRole("user-1", "Reviewer") },
      error: null,
    });
    const request = requestWithBearer("token");

    await expect(requireAI(request)).rejects.toMatchObject({ status: 403 });
  });

  it("throws UnauthorizedError when user is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const request = requestWithBearer("token");

    await expect(requireAI(request)).rejects.toThrow(UnauthorizedError);
    await expect(requireAI(request)).rejects.toMatchObject({ status: 401 });
  });
});
