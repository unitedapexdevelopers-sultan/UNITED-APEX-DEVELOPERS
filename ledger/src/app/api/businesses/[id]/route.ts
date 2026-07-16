import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Mirror prototype behavior: deleting a business also drops its direct children.
  await prisma.business.deleteMany({ where: { userId, OR: [{ id: params.id }, { parentId: params.id }] } });
  return NextResponse.json({ ok: true });
}
