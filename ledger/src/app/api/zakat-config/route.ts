import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { nisabBasis, nisabValue, rate } = body;

  const config = await prisma.zakatConfig.upsert({
    where: { userId },
    update: { nisabBasis, nisabValue: Number(nisabValue), rate: Number(rate) },
    create: { userId, nisabBasis, nisabValue: Number(nisabValue), rate: Number(rate) },
  });

  return NextResponse.json({ ...config, nisabValue: Number(config.nisabValue), rate: Number(config.rate) });
}
