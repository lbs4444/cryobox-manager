import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth";

describe("self-hosted password hashing", () => {
  it("hashes and verifies a password without storing the original text", async () => {
    const password = "Cryobox-2026";
    const encoded = await hashPassword(password);
    expect(encoded).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(encoded).not.toContain(password);
    expect(await verifyPassword(password, encoded)).toBe(true);
    expect(await verifyPassword("wrong-password", encoded)).toBe(false);
  });
});
