import { NextRequest, NextResponse } from "next/server";
import { sendDeliveryConfirmationWebhook } from "@/lib/stripe";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const transaction = await prisma.transaction.findUnique({
      where: { id: params.id },
      include: { buyer: true, seller: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Only buyer or seller can confirm delivery
    const isBuyer = transaction.buyerId === session.user.id;
    const isSeller = transaction.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: "Unauthorized - not party to this transaction" },
        { status: 403 }
      );
    }

    // Can only confirm delivery for shipped transactions
    if (transaction.status !== "SHIPPED") {
      return NextResponse.json(
        {
          error: "Transaction must be shipped before delivery can be confirmed",
        },
        { status: 400 }
      );
    }

    // Send delivery confirmation webhook
    await sendDeliveryConfirmationWebhook(params.id);

    return NextResponse.json({
      message: "Delivery confirmation sent",
      transactionId: params.id,
    });
  } catch (error) {
    console.error("Delivery confirmation error:", error);
    return NextResponse.json(
      { error: "Failed to confirm delivery" },
      { status: 500 }
    );
  }
}
