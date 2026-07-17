import { NextResponse, type NextMiddleware } from "next/server";
import { withAuth } from "next-auth/middleware";

const authMiddleware = withAuth({
  pages: { signIn: "/login" },
}) as NextMiddleware;

/**
 * DISABLE_AUTH is only meant for the desktop build (bound to 127.0.0.1,
 * never reachable from outside the machine). Never set this for a publicly
 * hosted deployment — see src/lib/session.ts for the matching bypass.
 */
const middleware: NextMiddleware = (req, ev) => {
  if (process.env.DISABLE_AUTH === "true") {
    return NextResponse.next();
  }
  return authMiddleware(req, ev);
};

export default middleware;

export const config = {
  matcher: [
    "/((?!api/auth|api/setup|login|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|icons/|sw.js|workbox-|worker-|fallback-).*)",
  ],
};
