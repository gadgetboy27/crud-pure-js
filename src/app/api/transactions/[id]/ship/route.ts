import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createTracking, getCarrierCode } from '@/lib/tracking';
import { addDays } from 'date-fns';
import { sendItemShippedEmail } from '@/lib/email';

const shipSchema = z.object({
  trackingNumber: z.string().min(5, 'Invalid tracking number'),
  trackingCarrier: z.string().min(2, 'Carrier name required'),
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
    const validatedData = shipSchema.parse(body);

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

    // Verify seller
    if (transaction.sellerId !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the seller can mark as shipped' },
        { status: 403 }
      );
    }

    // Check if payment has been received
    if (transaction.status !== 'PAYMENT_HELD') {
      return NextResponse.json(
        { error: 'Payment must be held in escrow before shipping' },
        { status: 400 }
      );
    }

    // Get carrier code
    const carrierCode = getCarrierCode(validatedData.trackingCarrier);

    // Create tracking with TrackingMore
    try {
      await createTracking(validatedData.trackingNumber, carrierCode);
    } catch (trackingError) {
      console.error('Tracking creation error:', trackingError);
      // Continue even if tracking creation fails - we can add it later
    }

    // Calculate auto-release date (e.g., 3 days after estimated delivery)
    const autoReleaseDate = addDays(new Date(), 10); // 10 days default

    // Update transaction
    const updatedTransaction = await prisma.transaction.update({
      where: { id: params.id },
      data: {
        trackingNumber: validatedData.trackingNumber,
        trackingCarrier: carrierCode,
        status: 'SHIPPED',
        shippedAt: new Date(),
        autoReleaseAt: autoReleaseDate,
      },
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

    // Send email notification to both parties with tracking info
    try {
      await sendItemShippedEmail(
        updatedTransaction.buyer.email,
        updatedTransaction.seller.email,
        updatedTransaction.buyer.name || 'Buyer',
        updatedTransaction.seller.name || 'Seller',
        updatedTransaction.productName,
        updatedTransaction.trackingNumber!,
        updatedTransaction.trackingCarrier!,
        updatedTransaction.id
      );
    } catch (emailError) {
      console.error('Failed to send shipped email:', emailError);
    }

    return NextResponse.json({
      message: 'Shipment tracking added successfully',
      transaction: updatedTransaction,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Shipping error:', error);
    return NextResponse.json(
      { error: 'Failed to process shipping information' },
      { status: 500 }
    );
  }
}
