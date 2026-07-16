import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, parentId } = body;
  if (!name) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const business = await prisma.business.create({
    data: { userId, name, parentId: parentId || null },
  });

  return NextResponse.json(business);
}
