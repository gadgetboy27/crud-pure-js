import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { capturePaymentIntent, createTransfer } from '@/lib/stripe';
import { sendFundsReleasedToSellerEmail, sendTransactionCompleteEmail } from '@/lib/email';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params;
    const session = await getServerSession(authOptions);

    // This endpoint can be called by:
    // 1. System (cron job) for auto-release
    // 2. Buyer for manual release
    // 3. Admin for dispute resolution

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

    // Authorization check
    if (session?.user) {
      const isBuyer = transaction.buyerId === session.user.id;
      const isAdmin = session.user.role === 'ADMIN';

      if (!isBuyer && !isAdmin) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 403 }
        );
      }
    }

    // Check if funds can be released
    const validStatuses = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'];
    if (!validStatuses.includes(transaction.status)) {
      return NextResponse.json(
        { error: 'Transaction not ready for fund release' },
        { status: 400 }
      );
    }

    // Check if seller has Stripe Connect account
    if (!transaction.seller.stripeAccountId) {
      return NextResponse.json(
        { error: 'Seller must set up payment account first' },
        { status: 400 }
      );
    }

    if (!transaction.stripePaymentIntentId) {
      return NextResponse.json(
        { error: 'No payment intent found' },
        { status: 400 }
      );
    }

    // Capture the payment (was held in escrow)
    await capturePaymentIntent(transaction.stripePaymentIntentId);

    // Transfer funds to seller (minus platform fee)
    const transfer = await createTransfer(
      parseFloat(transaction.sellerReceives.toString()),
      transaction.seller.stripeAccountId,
      transaction.currency,
      {
        transactionId: transaction.id,
        buyerId: transaction.buyerId,
        sellerId: transaction.sellerId,
      }
    );

    // Update transaction status
    const updatedTransaction = await prisma.transaction.update({
      where: { id: params.id },
      data: {
        status: 'FUNDS_RELEASED',
        stripeTransferId: transfer.id,
        completedAt: new Date(),
      },
    });

    // Send email notifications to both parties
    try {
      // Email to seller about funds released
      await sendFundsReleasedToSellerEmail(
        transaction.seller.email,
        transaction.seller.name || 'Seller',
        transaction.productName,
        parseFloat(transaction.sellerReceives.toString()),
        transaction.id
      );

      // Email to buyer about transaction complete
      await sendTransactionCompleteEmail(
        transaction.buyer.email,
        transaction.buyer.name || 'Buyer',
        transaction.seller.name || 'Seller',
        transaction.productName,
        transaction.id
      );
    } catch (emailError) {
      console.error('Failed to send completion emails:', emailError);
    }

    return NextResponse.json({
      message: 'Funds released successfully',
      transaction: updatedTransaction,
    });
  } catch (error) {
    console.error('Fund release error:', error);
    return NextResponse.json(
      { error: 'Failed to release funds' },
      { status: 500 }
    );
  }
}
