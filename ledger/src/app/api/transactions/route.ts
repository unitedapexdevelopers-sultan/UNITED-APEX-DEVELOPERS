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

  const tx = await prisma.transaction.create({
    data: {
      userId,
      walletId: walletId || null,
      businessId: businessId || null,
      type,
      amount: Number(amount),
      category,
      date: new Date(date),
    },
  });

  return NextResponse.json({ ...tx, amount: Number(tx.amount), date: tx.date.toISOString().slice(0, 10) });
}
