import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, type, balance, zakatable, currency } = body;
  if (!name || !type || balance === undefined || balance === "") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const wallet = await prisma.wallet.create({
    data: {
      userId,
      name,
      type,
      balance: Number(balance),
      zakatable: Boolean(zakatable),
      currency: currency || "USD",
    },
  });

  return NextResponse.json({ ...wallet, balance: Number(wallet.balance) });
}
