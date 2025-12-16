import Stripe from "stripe";

// Allow build to succeed without env vars - they're only needed at runtime
const stripeKey =
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder_for_build";

export const stripe = new Stripe(stripeKey, {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
  appInfo: {
    name: "Secure Escrow Marketplace",
    version: "0.1.0",
  },
});

// Stripe Connect helpers
export async function createConnectedAccount(
  email: string,
  country: string = "US"
) {
  try {
    const account = await stripe.accounts.create({
      type: "express",
      country,
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
    });

    return account;
  } catch (error) {
    console.error("Error creating connected account:", error);
    throw error;
  }
}

export async function createAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
) {
  try {
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return accountLink;
  } catch (error) {
    console.error("Error creating account link:", error);
    throw error;
  }
}

export async function createPaymentIntent(
  amount: number,
  currency: string = "usd",
  metadata: Record<string, string> = {}
) {
  try {
    // Convert amount to cents
    const amountInCents = Math.round(amount * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency,
      metadata,
      capture_method: "manual", // Don't capture immediately - hold funds
      payment_method_types: ["card"],
    });

    return paymentIntent;
  } catch (error) {
    console.error("Error creating payment intent:", error);
    throw error;
  }
}

export async function capturePaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error("Error capturing payment intent:", error);
    throw error;
  }
}

export async function cancelPaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);
    return paymentIntent;
  } catch (error) {
    console.error("Error canceling payment intent:", error);
    throw error;
  }
}

export async function createTransfer(
  amount: number,
  destinationAccountId: string,
  currency: string = "usd",
  metadata: Record<string, string> = {}
) {
  try {
    // Convert amount to cents
    const amountInCents = Math.round(amount * 100);

    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency,
      destination: destinationAccountId,
      metadata,
    });

    return transfer;
  } catch (error) {
    console.error("Error creating transfer:", error);
    throw error;
  }
}

export async function refundPayment(paymentIntentId: string, amount?: number) {
  try {
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundParams.amount = Math.round(amount * 100);
    }

    const refund = await stripe.refunds.create(refundParams);
    return refund;
  } catch (error) {
    console.error("Error creating refund:", error);
    throw error;
  }
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<Stripe.Event> {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return event;
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    throw error;
  }
}

export async function sendDeliveryConfirmationWebhook(
  transactionId: string
): Promise<void> {
  try {
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/webhooks`;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    }

    // Create the custom event payload
    const eventPayload = {
      type: "custom.delivery.confirmed",
      data: {
        object: {
          metadata: {
            transactionId,
          },
        },
      },
    };

    const payload = JSON.stringify(eventPayload);

    // Create signature (simplified for testing - in production use proper Stripe signature)
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = `t=${timestamp},v1=test-signature`;

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(
        `Webhook delivery failed: ${response.status} ${response.statusText}`
      );
    }

    console.log(
      `Delivery confirmation webhook sent for transaction ${transactionId}`
    );
  } catch (error) {
    console.error("Failed to send delivery confirmation webhook:", error);
    throw error;
  }
}
