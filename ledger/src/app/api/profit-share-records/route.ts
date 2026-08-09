import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { totalProfit, zakatAmount, sharedAmount, reinvestAmount } = body;

  const record = await prisma.profitShareRecord.create({
    data: {
      userId,
      totalProfit: Number(totalProfit),
      zakatAmount: Number(zakatAmount),
      sharedAmount: Number(sharedAmount),
      reinvestAmount: Number(reinvestAmount),
    },
  });

  return NextResponse.json({
    ...record,
    totalProfit: Number(record.totalProfit),
    zakatAmount: Number(record.zakatAmount),
    sharedAmount: Number(record.sharedAmount),
    reinvestAmount: Number(record.reinvestAmount),
    date: record.date.toISOString().slice(0, 10),
  });
}
