import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { asset, businessId, entryPrice, exitPrice, quantity, date } = body;
  if (!asset || entryPrice === "" || entryPrice === undefined || !quantity || !date) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const trade = await prisma.trade.create({
    data: {
      userId,
      asset,
      businessId: businessId || null,
      entryPrice: Number(entryPrice),
      exitPrice: exitPrice === "" || exitPrice === undefined || exitPrice === null ? null : Number(exitPrice),
      quantity: Number(quantity),
      date: new Date(date),
    },
  });

  return NextResponse.json({
    ...trade,
    entryPrice: Number(trade.entryPrice),
    exitPrice: trade.exitPrice === null ? null : Number(trade.exitPrice),
    quantity: Number(trade.quantity),
    date: trade.date.toISOString().slice(0, 10),
  });
}
