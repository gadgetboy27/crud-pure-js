import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/stripe";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing Stripe signature" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    try {
      let event;

      // For testing with custom events, allow simplified verification
      if (
        process.env.NODE_ENV === "development" &&
        body.includes("custom.delivery.confirmed")
      ) {
        // In development, accept custom events with simplified signature
        event = JSON.parse(body);
      } else {
        // Production: use proper Stripe signature verification
        event = await verifyWebhookSignature(
          body,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET || ""
        );
      }

      // Handle different event types
      switch (event.type) {
        case "payment_intent.succeeded":
          // Handle payment success
          console.log("Payment succeeded:", event.data.object.id);
          break;

        case "custom.delivery.confirmed":
          // Handle delivery confirmation (custom event for testing)
          console.log("Delivery confirmed for transaction");
          const transactionId = event.data.object.metadata?.transactionId;
          if (transactionId) {
            // Get current transaction to validate state transition
            const currentTransaction = await prisma.transaction.findUnique({
              where: { id: transactionId },
            });

            if (!currentTransaction) {
              console.error(
                `Transaction ${transactionId} not found for delivery confirmation`
              );
              break;
            }

            // Only allow delivery confirmation for shipped transactions
            if (currentTransaction.status !== "SHIPPED") {
              console.error(
                `Cannot confirm delivery for transaction ${transactionId} in status ${currentTransaction.status}`
              );
              break;
            }

            // Set auto-release date (7 days from now for testing, could be configurable)
            const autoReleaseAt = new Date();
            autoReleaseAt.setDate(autoReleaseAt.getDate() + 7);

            // Update transaction status to DELIVERED and set auto-release
            await prisma.transaction.update({
              where: { id: transactionId },
              data: {
                status: "DELIVERED",
                deliveredAt: new Date(),
                autoReleaseAt: autoReleaseAt,
              },
            });

            console.log(
              `Transaction ${transactionId} marked as delivered, auto-release scheduled for ${autoReleaseAt}`
            );
          }
          break;

        default:
          console.log("Unhandled event type:", event.type);
      }

      return NextResponse.json({ received: true });
    } catch (error) {
      console.error("Webhook signature verification failed:", error);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
