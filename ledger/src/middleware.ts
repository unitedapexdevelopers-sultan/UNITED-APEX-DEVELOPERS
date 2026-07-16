export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/((?!api/auth|api/setup|login|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|icons/|sw.js|workbox-|worker-|fallback-).*)",
  ],
};
