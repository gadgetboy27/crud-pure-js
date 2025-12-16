import { describe, it, expect, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

describe("01_users", () => {
  beforeEach(async () => {
    // Clean up database
    await prisma.user.deleteMany();
    vi.clearAllMocks();
  });

  it("should register a new user", async () => {
    const { POST } = await import("../src/app/api/auth/register/route");

    const mockRequest = {
      json: vi.fn().mockResolvedValue({
        email: "buyer@example.com",
        password: "StrongPass123!",
        name: "Test Buyer",
        role: "BUYER",
      }),
    } as any;

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.user.email).toBe("buyer@example.com");
    expect(data.user.role).toBe("BUYER");
  });

  it("should verify email", async () => {
    // Create a user with verification token
    const hashedPassword = await hash("StrongPass123!", 12);
    const verificationToken = "test-token-123";

    await prisma.user.create({
      data: {
        email: "seller@example.com",
        name: "Test Seller",
        hashedPassword,
        role: "SELLER",
        isActive: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const { GET } = await import("../src/app/api/auth/verify-email/route");

    const mockRequest = {
      url: `http://localhost:3000/api/auth/verify-email?token=${verificationToken}`,
    } as any;

    const response = await GET(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.verified).toBe(true);
  });
});
