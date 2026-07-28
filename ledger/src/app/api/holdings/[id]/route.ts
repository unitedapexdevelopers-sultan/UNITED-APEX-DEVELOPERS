import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

// Mark-to-market only: editing a holding updates its current price for display/percentage
// purposes. It doesn't move money — nothing is realized until the holding is removed.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { currentPrice } = body;
  if (currentPrice === "" || currentPrice === undefined) {
    return NextResponse.json({ error: "Missing currentPrice" }, { status: 400 });
  }

  const result = await prisma.holding.updateMany({
    where: { id: params.id, userId },
    data: { currentPrice: Number(currentPrice) },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const holding = await prisma.holding.findUnique({ where: { id: params.id } });
  return NextResponse.json({
    ...holding,
    quantity: Number(holding!.quantity),
    purchasePrice: Number(holding!.purchasePrice),
    currentPrice: Number(holding!.currentPrice),
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.$transaction(async (db) => {
    const holding = await db.holding.findFirst({ where: { id: params.id, userId } });
    if (!holding) return;
    if (holding.walletId) {
      // Removing a holding is treated as liquidating it at the current mark — credit the
      // wallet with current value (quantity * currentPrice), realizing the gain/loss.
      const currentValue = Number(holding.quantity) * Number(holding.currentPrice);
      await db.wallet.updateMany({ where: { id: holding.walletId }, data: { balance: { increment: currentValue } } });
    }
    await db.holding.deleteMany({ where: { id: params.id, userId } });
  });

  return NextResponse.json({ ok: true });
}
