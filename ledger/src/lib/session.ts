import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * DISABLE_AUTH is only meant for the desktop build, which binds to 127.0.0.1
 * and never leaves the machine — there's no one else on the other end of
 * that socket to authenticate against. Never set this for a publicly hosted
 * deployment.
 */
export async function requireUserId(): Promise<string | null> {
  if (process.env.DISABLE_AUTH === "true") {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    return user?.id ?? null;
  }

  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id ?? null;
}
