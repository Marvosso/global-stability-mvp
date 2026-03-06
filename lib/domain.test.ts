import { describe, it, expect } from "vitest";
import { normalizeDomainFromUrl } from "./domain";

describe("normalizeDomainFromUrl", () => {
  it("normalizes subdomains to eTLD+1", () => {
    expect(
      normalizeDomainFromUrl("https://earthquake.usgs.gov/earthquakes/eventpage")
    ).toBe("usgs.gov");
    expect(normalizeDomainFromUrl("http://www.gdacs.org/report")).toBe("gdacs.org");
  });

  it("handles bare hostnames and missing schemes", () => {
    expect(normalizeDomainFromUrl("reliefweb.int/report")).toBe("reliefweb.int");
    expect(normalizeDomainFromUrl("acleddata.com")).toBe("acleddata.com");
  });

  it("returns null for invalid input", () => {
    expect(normalizeDomainFromUrl("")).toBeNull();
    expect(normalizeDomainFromUrl("not a url space")).toBeNull();
  });
});

