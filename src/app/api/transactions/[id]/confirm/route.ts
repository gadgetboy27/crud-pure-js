import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sendTransactionConfirmedEmail } from '@/lib/email';

const confirmSchema = z.object({
  passcode: z.string().optional(),
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
    const validatedData = confirmSchema.parse(body);

    // Get transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: params.id },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Check if user is buyer or seller
    const isBuyer = transaction.buyerId === session.user.id;
    const isSeller = transaction.sellerId === session.user.id;

    if (!isBuyer && !isSeller) {
      return NextResponse.json(
        { error: 'Unauthorized - not party to this transaction' },
        { status: 403 }
      );
    }

    // Verify passcode if required
    if (transaction.confirmationType === 'PASSCODE') {
      if (!validatedData.passcode) {
        return NextResponse.json(
          { error: 'Passcode required' },
          { status: 400 }
        );
      }

      if (validatedData.passcode !== transaction.confirmationPasscode) {
        return NextResponse.json(
          { error: 'Invalid passcode' },
          { status: 400 }
        );
      }
    }

    // Update confirmation status
    const updateData: any = {};
    if (isBuyer) {
      updateData.buyerConfirmed = true;
    }
    if (isSeller) {
      updateData.sellerConfirmed = true;
    }

    // Check if both parties confirmed
    const bothConfirmed =
      (isBuyer ? true : transaction.buyerConfirmed) &&
      (isSeller ? true : transaction.sellerConfirmed);

    if (bothConfirmed) {
      updateData.status = 'PENDING_PAYMENT';
      updateData.confirmedAt = new Date();
    }

    const updatedTransaction = await prisma.transaction.update({
      where: { id: params.id },
      data: updateData,
      include: {
        buyer: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        seller: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    // Create confirmation record
    await prisma.confirmation.create({
      data: {
        transactionId: params.id,
        userId: session.user.id,
        confirmed: true,
        confirmedAt: new Date(),
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        userAgent: request.headers.get('user-agent'),
      },
    });

    // Send email if both parties confirmed
    if (bothConfirmed) {
      try {
        await sendTransactionConfirmedEmail(
          updatedTransaction.buyer.email,
          updatedTransaction.buyer.name || 'Buyer',
          updatedTransaction.seller.name || 'Seller',
          updatedTransaction.productName,
          parseFloat(updatedTransaction.amount.toString()),
          updatedTransaction.id
        );
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    }

    return NextResponse.json({
      message: 'Transaction confirmed successfully',
      transaction: updatedTransaction,
      bothConfirmed,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Transaction confirmation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
