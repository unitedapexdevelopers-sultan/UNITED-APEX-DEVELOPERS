import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, percentage } = body;

  const result = await prisma.profitShareParticipant.updateMany({
    where: { id: params.id, userId },
    data: {
      ...(name !== undefined && { name }),
      ...(percentage !== undefined && { percentage: Number(percentage) }),
    },
  });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const participant = await prisma.profitShareParticipant.findUnique({ where: { id: params.id } });
  return NextResponse.json({ ...participant, percentage: Number(participant!.percentage) });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.profitShareParticipant.deleteMany({ where: { id: params.id, userId } });
  return NextResponse.json({ ok: true });
}
