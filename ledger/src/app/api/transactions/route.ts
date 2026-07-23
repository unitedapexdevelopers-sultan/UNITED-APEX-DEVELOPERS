import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { walletId, businessId, type, amount, category, date } = body;
  if (!amount || !category || !date) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const numAmount = Number(amount);
  const delta = type === "income" ? numAmount : -numAmount;

  try {
    const tx = await prisma.$transaction(async (db) => {
      if (walletId) {
        const wallet = await db.wallet.findFirst({ where: { id: walletId, userId } });
        if (!wallet) throw new Error("WALLET_NOT_FOUND");
        await db.wallet.update({ where: { id: walletId }, data: { balance: { increment: delta } } });
      }
      return db.transaction.create({
        data: {
          userId,
          walletId: walletId || null,
          businessId: businessId || null,
          type,
          amount: numAmount,
          category,
          date: new Date(date),
        },
      });
    });

    return NextResponse.json({ ...tx, amount: Number(tx.amount), date: tx.date.toISOString().slice(0, 10) });
  } catch (e) {
    if (e instanceof Error && e.message === "WALLET_NOT_FOUND") {
      return NextResponse.json({ error: "Wallet not found" }, { status: 400 });
    }
    throw e;
  }
}
