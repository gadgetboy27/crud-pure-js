import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function stripeCall<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    console.info(
      JSON.stringify({
        type: "STRIPE_CALL",
        name,
        durationMs: Date.now() - start,
      })
    );
    return result;
  } catch (err: any) {
    console.error(
      JSON.stringify({
        type: "STRIPE_ERROR",
        name,
        error: err.message,
      })
    );
    throw err;
  }
}

export { stripe };
