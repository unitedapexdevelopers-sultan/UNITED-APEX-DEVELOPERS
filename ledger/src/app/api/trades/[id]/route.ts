import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.$transaction(async (db) => {
    const trade = await db.trade.findFirst({ where: { id: params.id, userId } });
    if (!trade) return;
    if (trade.walletId) {
      const entry = Number(trade.entryPrice);
      const qty = Number(trade.quantity);
      const exit = trade.exitPrice === null ? null : Number(trade.exitPrice);
      const delta = exit === null ? -(entry * qty) : (exit - entry) * qty;
      // Reverse whatever the trade originally applied to the wallet.
      await db.wallet.updateMany({ where: { id: trade.walletId }, data: { balance: { increment: -delta } } });
    }
    await db.trade.deleteMany({ where: { id: params.id, userId } });
  });

  return NextResponse.json({ ok: true });
}
