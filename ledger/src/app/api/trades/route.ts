import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { asset, businessId, walletId, entryPrice, exitPrice, quantity, date } = body;
  if (!asset || entryPrice === "" || entryPrice === undefined || !quantity || !date) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const numEntry = Number(entryPrice);
  const numQty = Number(quantity);
  const numExit = exitPrice === "" || exitPrice === undefined || exitPrice === null ? null : Number(exitPrice);
  // Opening a trade withdraws the entry cost from the wallet; a trade logged already-closed
  // settles the realized P&L (exit proceeds minus entry cost) in one step.
  const delta = numExit === null ? -(numEntry * numQty) : (numExit - numEntry) * numQty;

  try {
    const trade = await prisma.$transaction(async (db) => {
      if (walletId) {
        const wallet = await db.wallet.findFirst({ where: { id: walletId, userId } });
        if (!wallet) throw new Error("WALLET_NOT_FOUND");
        await db.wallet.update({ where: { id: walletId }, data: { balance: { increment: delta } } });
      }
      return db.trade.create({
        data: {
          userId,
          asset,
          businessId: businessId || null,
          walletId: walletId || null,
          entryPrice: numEntry,
          exitPrice: numExit,
          quantity: numQty,
          date: new Date(date),
        },
      });
    });

    return NextResponse.json({
      ...trade,
      entryPrice: Number(trade.entryPrice),
      exitPrice: trade.exitPrice === null ? null : Number(trade.exitPrice),
      quantity: Number(trade.quantity),
      date: trade.date.toISOString().slice(0, 10),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "WALLET_NOT_FOUND") {
      return NextResponse.json({ error: "Wallet not found" }, { status: 400 });
    }
    throw e;
  }
}
