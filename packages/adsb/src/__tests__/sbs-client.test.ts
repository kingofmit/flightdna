import { describe, it, expect } from "vitest";
import { SBSClient } from "../sbs-client";

describe("SBSClient", () => {
  it("should construct with default config", () => {
    const client = new SBSClient();
    expect(client.isConnected).toBe(false);
  });

  it("should construct with custom config", () => {
    const client = new SBSClient({ host: "192.168.1.100", port: 30004 });
    expect(client.isConnected).toBe(false);
  });

  it("should accept and remove listeners", () => {
    const client = new SBSClient();
    const unsub = client.onState(() => {});
    unsub();
    // No assertion needed — just verify no errors
  });
});
