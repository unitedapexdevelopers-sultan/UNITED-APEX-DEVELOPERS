import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function PUT(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { rate } = body;

  const config = await prisma.zakatConfig.upsert({
    where: { userId },
    update: { rate: Number(rate) },
    create: { userId, rate: Number(rate) },
  });

  return NextResponse.json({ rate: Number(config.rate) });
}
