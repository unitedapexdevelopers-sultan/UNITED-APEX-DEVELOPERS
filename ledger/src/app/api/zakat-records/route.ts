import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { eligibleWealth, zakatDue } = body;

  const record = await prisma.zakatRecord.create({
    data: { userId, eligibleWealth: Number(eligibleWealth), zakatDue: Number(zakatDue) },
  });

  return NextResponse.json({
    ...record,
    eligibleWealth: Number(record.eligibleWealth),
    zakatDue: Number(record.zakatDue),
    date: record.date.toISOString().slice(0, 10),
  });
}
