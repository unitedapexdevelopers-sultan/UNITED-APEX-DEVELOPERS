import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, type, balance, zakatable, currency } = body;

  const result = await prisma.wallet.updateMany({
    where: { id: params.id, userId },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
      ...(balance !== undefined && { balance: Number(balance) }),
      ...(zakatable !== undefined && { zakatable: Boolean(zakatable) }),
      ...(currency !== undefined && { currency }),
    },
  });

  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wallet = await prisma.wallet.findUnique({ where: { id: params.id } });
  return NextResponse.json({ ...wallet, balance: Number(wallet!.balance) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.wallet.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
