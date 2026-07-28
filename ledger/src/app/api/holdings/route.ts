import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, walletId, quantity, purchasePrice, currentPrice } = body;
  if (!name || quantity === "" || quantity === undefined || purchasePrice === "" || purchasePrice === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const numQuantity = Number(quantity);
  const numPurchasePrice = Number(purchasePrice);
  const numCurrentPrice = currentPrice === "" || currentPrice === undefined ? numPurchasePrice : Number(currentPrice);
  // Buying a holding withdraws its cost basis from the funding wallet.
  const costBasis = numQuantity * numPurchasePrice;

  try {
    const holding = await prisma.$transaction(async (db) => {
      if (walletId) {
        const wallet = await db.wallet.findFirst({ where: { id: walletId, userId } });
        if (!wallet) throw new Error("WALLET_NOT_FOUND");
        await db.wallet.update({ where: { id: walletId }, data: { balance: { decrement: costBasis } } });
      }
      return db.holding.create({
        data: {
          userId,
          walletId: walletId || null,
          name,
          quantity: numQuantity,
          purchasePrice: numPurchasePrice,
          currentPrice: numCurrentPrice,
        },
      });
    });

    return NextResponse.json({
      ...holding,
      quantity: Number(holding.quantity),
      purchasePrice: Number(holding.purchasePrice),
      currentPrice: Number(holding.currentPrice),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "WALLET_NOT_FOUND") {
      return NextResponse.json({ error: "Wallet not found" }, { status: 400 });
    }
    throw e;
  }
}
