import { beforeAll, afterAll, vi } from "vitest";

// Mock Next.js request context
vi.mock("next/headers", () => ({
  headers: vi.fn(() => ({
    get: vi.fn((name: string) => {
      if (name === "x-forwarded-for") return "127.0.0.1";
      if (name === "x-real-ip") return "127.0.0.1";
      return null;
    }),
    has: vi.fn(() => false),
    set: vi.fn(),
    delete: vi.fn(),
    forEach: vi.fn(),
  })),
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    forEach: vi.fn(),
  })),
}));

// Mock Next.js navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// Mock NextAuth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: {
      id: "buyer_123",
      email: "buyer@test.com",
      role: "BUYER",
    },
  }),
}));

// Also mock next-auth/next
vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: {
      id: "buyer_123",
      email: "buyer@test.com",
      role: "BUYER",
    },
  }),
}));

// Mock rate limiting
vi.mock("../src/lib/rate-limit", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimit: vi.fn(() => ({
    check: vi.fn().mockReturnValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 900000,
    }),
  })),
  authRateLimiter: {
    check: vi.fn().mockReturnValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 900000,
    }),
  },
  loginRateLimiter: {
    check: vi.fn().mockReturnValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 900000,
    }),
  },
  passwordResetRateLimiter: {
    check: vi.fn().mockReturnValue({
      success: true,
      remaining: 10,
      reset: Date.now() + 900000,
    }),
  },
}));

// Mock fetch to prevent real HTTP calls
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: "OK",
  json: vi.fn().mockResolvedValue({ received: true }),
  text: vi.fn().mockResolvedValue("mock response"),
});

// Mock email functions to prevent real email sending
vi.mock("../src/lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendTransactionCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendTransactionShippedEmail: vi.fn().mockResolvedValue(undefined),
  sendTransactionDeliveredEmail: vi.fn().mockResolvedValue(undefined),
  sendTransactionCompletedEmail: vi.fn().mockResolvedValue(undefined),
  sendDisputeCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendDisputeResolvedEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock bcryptjs to make password hashing instant
vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("hashed_password_mock"),
  compare: vi.fn().mockResolvedValue(true),
}));

// Mock the Prisma singleton
vi.mock("../src/lib/prisma", () => ({
  default: {
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    user: {
      findUnique: vi.fn((args) => {
        if (args.where.email === "buyer@test.com") {
          return Promise.resolve({
            id: "buyer_123",
            email: "buyer@test.com",
            name: "Test Buyer",
            hashedPassword: "hashed",
            role: "BUYER",
            isActive: true,
            emailVerified: new Date(),
          });
        }
        if (args.where.email === "seller@test.com") {
          return Promise.resolve({
            id: "seller_123",
            email: "seller@test.com",
            name: "Test Seller",
            hashedPassword: "hashed",
            role: "SELLER",
            isActive: true,
            emailVerified: new Date(),
            stripeAccountId: "acct_test_seller",
          });
        }
        if (args.where.emailVerificationToken) {
          return Promise.resolve({
            id: "user_verify_123",
            email: "seller@example.com",
            name: "Test Seller",
            hashedPassword: "hashed",
            role: "SELLER",
            isActive: false,
            emailVerified: null,
            emailVerificationToken: args.where.emailVerificationToken,
            emailVerificationExpires: new Date(
              Date.now() + 24 * 60 * 60 * 1000
            ),
          });
        }
        return Promise.resolve(null);
      }),
      create: vi.fn((args) => {
        return Promise.resolve({
          id: "user_" + Math.random().toString(36).substr(2, 9),
          ...args.data,
          emailVerificationToken: "token_123",
          emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      }),
      update: vi.fn((args) => {
        return Promise.resolve({
          id: args.where.id,
          ...args.data,
        });
      }),
      deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
    transaction: {
      findUnique: vi.fn((args) => {
        if (args.where.id) {
          const baseTransaction = {
            id: args.where.id,
            buyerId: "buyer_123",
            sellerId: "seller_123",
            productName: "Test Product",
            productDescription: "Test",
            productUrl: "https://example.com",
            amount: 100.0,
            platformFee: 3.0,
            bankFee: 2.9,
            totalFees: 5.9,
            sellerReceives: 94.1,
            confirmationType: "EMAIL",
            stripePaymentIntentId: "pi_test_123",
            trackingNumber: "TRACK123",
            trackingCarrier: "UPS",
          };

          // For release test, return delivered transaction
          if (args.where.id === "tx_release_test") {
            return Promise.resolve({
              ...baseTransaction,
              status: "DELIVERED",
              buyerConfirmed: true,
              sellerConfirmed: true,
              buyer: {
                id: "buyer_123",
                email: "buyer@test.com",
                name: "Test Buyer",
                role: "BUYER",
              },
              seller: {
                id: "seller_123",
                email: "seller@test.com",
                name: "Test Seller",
                role: "SELLER",
                stripeAccountId: "acct_test_seller",
              },
            });
          }
          // For pay test, return pending payment transaction
          if (args.where.id && args.where.id.includes("pay")) {
            return Promise.resolve({
              ...baseTransaction,
              status: "PENDING_PAYMENT",
              buyerConfirmed: true,
              sellerConfirmed: true,
              buyer: {
                id: "buyer_123",
                email: "buyer@test.com",
                name: "Test Buyer",
                role: "BUYER",
              },
              seller: {
                id: "seller_123",
                email: "seller@test.com",
                name: "Test Seller",
                role: "SELLER",
                stripeAccountId: "acct_test_seller",
              },
            });
          }
          // Default transaction for other tests
          return Promise.resolve({
            ...baseTransaction,
            status: "SHIPPED",
            buyer: {
              id: "buyer_123",
              email: "buyer@test.com",
              name: "Test Buyer",
              role: "BUYER",
            },
            seller: {
              id: "seller_123",
              email: "seller@test.com",
              name: "Test Seller",
              role: "SELLER",
              stripeAccountId: "acct_test_seller",
            },
          });
        }
        return Promise.resolve(null);
      }),
      create: vi.fn((args) => {
        // For pay test, return predictable ID
        if (args.data.status === "PENDING_PAYMENT") {
          return Promise.resolve({
            id: "tx_pay_test_123",
            ...args.data,
          });
        }
        return Promise.resolve({
          id: "tx_" + Math.random().toString(36).substr(2, 9),
          ...args.data,
        });
      }),
      update: vi.fn((args) => {
        return Promise.resolve({
          id: args.where.id,
          ...args.data,
        });
      }),
      deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
    },
  },
}));

// Mock PrismaClient constructor to prevent database connections
vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(function () {
    return {
      $connect: vi.fn(),
      $disconnect: vi.fn(),
      user: {
        findUnique: vi.fn((args) => {
          if (args.where.email === "buyer@test.com") {
            return Promise.resolve({
              id: "buyer_123",
              email: "buyer@test.com",
              name: "Test Buyer",
              hashedPassword: "hashed",
              role: "BUYER",
              isActive: true,
              emailVerified: new Date(),
            });
          }
          if (args.where.email === "seller@test.com") {
            return Promise.resolve({
              id: "seller_123",
              email: "seller@test.com",
              name: "Test Seller",
              hashedPassword: "hashed",
              role: "SELLER",
              isActive: true,
              emailVerified: new Date(),
              stripeAccountId: "acct_test_seller",
            });
          }
          if (args.where.emailVerificationToken) {
            return Promise.resolve({
              id: "user_verify_123",
              email: "seller@example.com",
              name: "Test Seller",
              hashedPassword: "hashed",
              role: "SELLER",
              isActive: false,
              emailVerified: null,
              emailVerificationToken: args.where.emailVerificationToken,
              emailVerificationExpires: new Date(
                Date.now() + 24 * 60 * 60 * 1000
              ),
            });
          }
          return Promise.resolve(null);
        }),
        create: vi.fn((args) => {
          return Promise.resolve({
            id: "user_" + Math.random().toString(36).substr(2, 9),
            ...args.data,
            emailVerificationToken: "token_123",
            emailVerificationExpires: new Date(
              Date.now() + 24 * 60 * 60 * 1000
            ),
          });
        }),
        update: vi.fn((args) => {
          return Promise.resolve({
            id: args.where.id,
            ...args.data,
          });
        }),
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
      },
      transaction: {
        findUnique: vi.fn((args) => {
          if (args.where.id) {
            const baseTransaction = {
              id: args.where.id,
              buyerId: "buyer_123",
              sellerId: "seller_123",
              productName: "Test Product",
              productDescription: "Test",
              productUrl: "https://example.com",
              amount: 100.0,
              platformFee: 3.0,
              bankFee: 2.9,
              totalFees: 5.9,
              sellerReceives: 94.1,
              confirmationType: "EMAIL",
              stripePaymentIntentId: "pi_test_123",
              trackingNumber: "TRACK123",
              trackingCarrier: "UPS",
            };

            // For release test, return delivered transaction
            if (args.where.id === "tx_release_test") {
              return Promise.resolve({
                ...baseTransaction,
                status: "DELIVERED",
                buyerConfirmed: true,
                sellerConfirmed: true,
                buyer: {
                  id: "buyer_123",
                  email: "buyer@test.com",
                  name: "Test Buyer",
                  role: "BUYER",
                },
                seller: {
                  id: "seller_123",
                  email: "seller@test.com",
                  name: "Test Seller",
                  role: "SELLER",
                  stripeAccountId: "acct_test_seller",
                },
              });
            }
            // For pay test, return pending payment transaction
            if (args.where.id && args.where.id.includes("pay")) {
              return Promise.resolve({
                ...baseTransaction,
                status: "PENDING_PAYMENT",
                buyerConfirmed: true,
                sellerConfirmed: true,
                buyer: {
                  id: "buyer_123",
                  email: "buyer@test.com",
                  name: "Test Buyer",
                  role: "BUYER",
                },
                seller: {
                  id: "seller_123",
                  email: "seller@test.com",
                  name: "Test Seller",
                  role: "SELLER",
                  stripeAccountId: "acct_test_seller",
                },
              });
            }
            // Default transaction for other tests
            return Promise.resolve({
              ...baseTransaction,
              status: "SHIPPED",
              buyer: {
                id: "buyer_123",
                email: "buyer@test.com",
                name: "Test Buyer",
                role: "BUYER",
              },
              seller: {
                id: "seller_123",
                email: "seller@test.com",
                name: "Test Seller",
                role: "SELLER",
                stripeAccountId: "acct_test_seller",
              },
            });
          }
          return Promise.resolve(null);
        }),
        create: vi.fn((args) => {
          // For pay test, return predictable ID
          if (args.data.status === "PENDING_PAYMENT") {
            return Promise.resolve({
              id: "tx_pay_test_123",
              ...args.data,
            });
          }
          return Promise.resolve({
            id: "tx_" + Math.random().toString(36).substr(2, 9),
            ...args.data,
          });
        }),
        update: vi.fn((args) => {
          return Promise.resolve({
            id: args.where.id,
            ...args.data,
          });
        }),
        deleteMany: vi.fn(() => Promise.resolve({ count: 0 })),
      },
    };
  }),
}));
