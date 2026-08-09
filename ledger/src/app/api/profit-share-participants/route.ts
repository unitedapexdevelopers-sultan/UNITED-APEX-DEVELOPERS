import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, percentage } = body;
  if (!name || percentage === "" || percentage === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const participant = await prisma.profitShareParticipant.create({
    data: { userId, name, percentage: Number(percentage) },
  });

  return NextResponse.json({ ...participant, percentage: Number(participant.percentage) });
}
