import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { calculateFees, validateUrl, generatePasscode } from '@/lib/utils';
import { Decimal } from '@prisma/client/runtime/library';
import { sendTransactionCreatedEmail } from '@/lib/email';

const createTransactionSchema = z.object({
  sellerId: z.string().optional(), // Optional for new sellers
  sellerEmail: z.string().email().optional(),
  productName: z.string().min(3, 'Product name must be at least 3 characters'),
  productDescription: z.string().min(10, 'Description must be at least 10 characters'),
  productUrl: z.string().url('Must be a valid URL'),
  productImageUrl: z.string().url().optional(),
  amount: z.number().positive('Amount must be positive'),
  confirmationType: z.enum(['EMAIL', 'PASSCODE', 'CHAT', 'BOTH_PARTIES']),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validatedData = createTransactionSchema.parse(body);

    // Validate product URL
    if (!validateUrl(validatedData.productUrl)) {
      return NextResponse.json(
        { error: 'Invalid product URL' },
        { status: 400 }
      );
    }

    // Find or create seller
    let seller;
    if (validatedData.sellerId) {
      seller = await prisma.user.findUnique({
        where: { id: validatedData.sellerId },
      });
    } else if (validatedData.sellerEmail) {
      seller = await prisma.user.findUnique({
        where: { email: validatedData.sellerEmail },
      });
    }

    if (!seller) {
      return NextResponse.json(
        { error: 'Seller not found' },
        { status: 404 }
      );
    }

    // Calculate fees
    const fees = calculateFees(validatedData.amount);

    // Generate passcode if needed
    const passcode = validatedData.confirmationType === 'PASSCODE'
      ? generatePasscode(6)
      : null;

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        buyerId: session.user.id,
        sellerId: seller.id,
        productName: validatedData.productName,
        productDescription: validatedData.productDescription,
        productUrl: validatedData.productUrl,
        productImageUrl: validatedData.productImageUrl,
        amount: new Decimal(validatedData.amount),
        platformFee: new Decimal(fees.platformFee),
        bankFee: new Decimal(fees.bankFee),
        totalFees: new Decimal(fees.totalFees),
        sellerReceives: new Decimal(fees.sellerReceives),
        confirmationType: validatedData.confirmationType,
        confirmationPasscode: passcode,
        status: 'PENDING_CONFIRMATION',
      },
      include: {
        buyer: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        seller: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Send email notification to seller
    try {
      await sendTransactionCreatedEmail(
        transaction.seller.email,
        transaction.seller.name || 'Seller',
        transaction.buyer.name || 'Buyer',
        transaction.productName,
        parseFloat(transaction.amount.toString()),
        transaction.id
      );
    } catch (emailError) {
      console.error('Failed to send transaction created email:', emailError);
      // Don't fail the transaction if email fails
    }

    return NextResponse.json(
      {
        message: 'Transaction created successfully',
        transaction,
        passcode: passcode, // Only return in dev, remove in production
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Transaction creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
