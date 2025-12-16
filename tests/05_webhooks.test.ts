import { describe, it, expect, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("05_webhooks", () => {
  let transactionId: string;

  beforeEach(async () => {
    // Clean up and setup test data
    await prisma.transaction.deleteMany();
    await prisma.user.deleteMany();

    const buyer = await prisma.user.create({
      data: {
        email: "buyer@test.com",
        name: "Test Buyer",
        hashedPassword: "hashed",
        role: "BUYER",
        isActive: true,
        emailVerified: new Date(),
      },
    });

    const seller = await prisma.user.create({
      data: {
        email: "seller@test.com",
        name: "Test Seller",
        hashedPassword: "hashed",
        role: "SELLER",
        isActive: true,
        emailVerified: new Date(),
        stripeAccountId: "acct_test_seller",
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        buyerId: buyer.id,
        sellerId: seller.id,
        productName: "Test Product",
        productDescription: "Test",
        productUrl: "https://example.com",
        amount: 100.0,
        platformFee: 3.0,
        bankFee: 2.9,
        totalFees: 5.9,
        sellerReceives: 94.1,
        confirmationType: "EMAIL",
        status: "SHIPPED",
        stripePaymentIntentId: "pi_test_123",
        trackingNumber: "TRACK123",
        trackingCarrier: "UPS",
      },
    });

    transactionId = transaction.id;
  });

  it("should handle delivery confirmation webhook", async () => {
    // Mock the verifyWebhookSignature to return a valid event
    vi.doMock("../src/lib/stripe", () => ({
      verifyWebhookSignature: vi.fn().mockResolvedValue({
        type: "custom.delivery.confirmed",
        data: { object: { metadata: { transactionId } } },
      } as any), // Type assertion needed for custom event type
    }));

    const { POST } = await import("../src/app/api/stripe/webhooks/route");

    const mockRequest = {
      headers: new Map([["stripe-signature", "t=1234567890,v1=test-sig"]]),
      text: vi.fn().mockResolvedValue(
        JSON.stringify({
          type: "custom.delivery.confirmed",
          data: { object: { metadata: { transactionId } } },
        })
      ),
    } as any;

    const response = await POST(mockRequest);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.received).toBe(true);
  });

  it("should reject missing webhook signature", async () => {
    const { POST } = await import("../src/app/api/stripe/webhooks/route");

    const mockRequest = {
      headers: new Map(),
      text: vi.fn().mockResolvedValue("{}"),
    } as any;

    const response = await POST(mockRequest);
    expect(response.status).toBe(400);
  });
});
