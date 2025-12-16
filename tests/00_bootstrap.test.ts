import { describe, it, expect } from "vitest";

describe("00_bootstrap", () => {
  it("should have required environment variables", () => {
    expect(process.env.STRIPE_SECRET_KEY).toBeDefined();
    expect(process.env.DATABASE_URL).toBeDefined();
    expect(process.env.NEXTAUTH_SECRET).toBeDefined();
  });

  it("should load Prisma client", () => {
    // Mocked Prisma client should be available
    const { PrismaClient } = require("@prisma/client");
    expect(PrismaClient).toBeDefined();
  });
});
