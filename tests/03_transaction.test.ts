import { describe, it, expect, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

describe("03_transaction", () => {
  const buyerId = "buyer_123";
  const sellerId = "seller_123";

  beforeEach(async () => {
    // Clean up database (though mocked, this ensures clean state)
    vi.clearAllMocks();
  });

  it("should create transaction", async () => {
    // Mock session
    vi.doMock("next-auth/next", () => ({
      getServerSession: vi.fn().mockResolvedValue({
        user: { id: buyerId, email: "buyer@test.com", role: "BUYER" },
      }),
    }));

    const { POST } = await import("../src/app/api/transactions/create/route");

    const mockRequest = {
      json: vi.fn().mockResolvedValue({
        sellerEmail: "seller@test.com",
        productName: "Test Product",
        productDescription: "A test product for escrow",
        productUrl: "https://example.com/product",
        amount: 100.0,
        confirmationType: "EMAIL",
      }),
    } as any;

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.transaction.buyerId).toBe(buyerId);
    expect(data.transaction.sellerId).toBe("seller_123"); // Mocked seller ID
    expect(data.transaction.status).toBe("PENDING_CONFIRMATION");
  });

  it("should hold funds in escrow", async () => {
    // Create transaction first
    const transaction = await prisma.transaction.create({
      data: {
        buyerId,
        sellerId,
        productName: "Test Product",
        productDescription: "Test",
        productUrl: "https://example.com",
        amount: 100.0,
        platformFee: 3.0,
        bankFee: 2.9,
        totalFees: 5.9,
        sellerReceives: 94.1,
        confirmationType: "EMAIL",
        status: "PENDING_PAYMENT", // Correct status for payment
        buyerConfirmed: true,
        sellerConfirmed: true,
      },
    });

    // Mock Stripe
    const mockStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({
          id: "pi_test_123",
          client_secret: "secret_test",
          capture_method: "manual",
        }),
      },
    };

    vi.doMock("../src/lib/stripe", () => ({
      createPaymentIntent: vi.fn().mockResolvedValue({
        id: "pi_test_123",
        client_secret: "secret_test",
      }),
    }));

    const { POST } = await import("../src/app/api/transactions/[id]/pay/route");

    const mockRequest = {
      json: vi.fn().mockResolvedValue({
        paymentMethodId: "pm_test_123",
      }),
    } as any;

    const mockParams = { id: transaction.id };

    // Mock session
    vi.doMock("next-auth/next", () => ({
      getServerSession: vi.fn().mockResolvedValue({
        user: { id: buyerId },
      }),
    }));

    const response = await POST(mockRequest, {
      params: Promise.resolve(mockParams),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transaction.status).toBe("PAYMENT_HELD");
    expect(data.clientSecret).toBeDefined();
  });

  it("should release funds after delivery", async () => {
    // Use mocked transaction with DELIVERED status
    const transactionId = "tx_release_test";

    // Mock Stripe functions
    vi.doMock("../src/lib/stripe", () => ({
      capturePaymentIntent: vi.fn().mockResolvedValue({}),
      createTransfer: vi.fn().mockResolvedValue({ id: "tr_test_123" }),
    }));

    // Mock session (buyer releasing)
    vi.doMock("next-auth/next", () => ({
      getServerSession: vi.fn().mockResolvedValue({
        user: { id: buyerId, role: "BUYER" },
      }),
    }));

    const { POST } =
      await import("../src/app/api/transactions/[id]/release/route");

    const mockRequest = {} as any;
    const mockParams = { id: transactionId };

    const response = await POST(mockRequest, {
      params: Promise.resolve(mockParams),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transaction.status).toBe("FUNDS_RELEASED");
  });
});
