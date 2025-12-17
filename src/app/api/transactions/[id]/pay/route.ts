import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createPaymentIntent } from '@/lib/stripe';
import { sendPaymentReceivedEmail } from '@/lib/email';

const paymentSchema = z.object({
  paymentMethodId: z.string(),
});

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = paymentSchema.parse(body);

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: params.id },
      include: {
        buyer: true,
        seller: true,
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify buyer
    if (transaction.buyerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the buyer can make payment' },
        { status: 403 }
      );
    }

    // Check if transaction is in correct state
    if (transaction.status !== 'PENDING_PAYMENT') {
      return NextResponse.json(
        { error: 'Transaction not ready for payment' },
        { status: 400 }
      );
    }

    // Check if both parties confirmed
    if (!transaction.buyerConfirmed || !transaction.sellerConfirmed) {
      return NextResponse.json(
        { error: 'Both parties must confirm before payment' },
        { status: 400 }
      );
    }

    // Create Stripe Payment Intent (held in escrow, not captured yet)
    const paymentIntent = await createPaymentIntent(
      parseFloat(transaction.amount.toString()),
      transaction.currency,
      {
        transactionId: transaction.id,
        buyerId: transaction.buyerId,
        sellerId: transaction.sellerId,
        productName: transaction.productName,
      }
    );

    // Update transaction with payment intent ID
    const updatedTransaction = await prisma.transaction.update({
      where: { id: params.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        status: 'PAYMENT_HELD',
        paidAt: new Date(),
      },
    });

    // Send payment received emails to both parties
    try {
      await sendPaymentReceivedEmail(
        transaction.buyer.email,
        transaction.seller.email,
        transaction.buyer.name || 'Buyer',
        transaction.seller.name || 'Seller',
        transaction.productName,
        parseFloat(transaction.amount.toString()),
        transaction.id
      );
    } catch (emailError) {
      console.error('Failed to send payment received email:', emailError);
    }

    return NextResponse.json({
      message: 'Payment initiated successfully',
      clientSecret: paymentIntent.client_secret,
      transaction: updatedTransaction,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Payment error:', error);
    return NextResponse.json(
      { error: 'Payment processing failed' },
      { status: 500 }
    );
  }
}
