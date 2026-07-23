import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.$transaction(async (db) => {
    const tx = await db.transaction.findFirst({ where: { id: params.id, userId } });
    if (!tx) return;
    if (tx.walletId) {
      const delta = tx.type === "income" ? -Number(tx.amount) : Number(tx.amount);
      await db.wallet.updateMany({ where: { id: tx.walletId }, data: { balance: { increment: delta } } });
    }
    await db.transaction.deleteMany({ where: { id: params.id, userId } });
  });

  return NextResponse.json({ ok: true });
}
