import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * One-time bootstrap: creates/updates the owner account from ADMIN_EMAIL /
 * ADMIN_PASSWORD, gated by SETUP_TOKEN. Remove this route (and the
 * SETUP_TOKEN env var) once the account exists — it's not meant to stay
 * in production.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const expected = process.env.SETUP_TOKEN;

  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json({ error: "ADMIN_EMAIL/ADMIN_PASSWORD not set" }, { status: 500 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash },
  });

  await prisma.zakatConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, nisabBasis: "gold", nisabValue: 5000, rate: 2.5 },
  });

  return NextResponse.json({ ok: true, email });
}
