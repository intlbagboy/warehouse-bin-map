import { NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "./lib/auth";

// Cookie-based login gate — works reliably on mobile browsers and in-app
// webviews, unlike native HTTP Basic Auth prompts (which some mobile browsers,
// especially in-app ones from Messages/Slack/etc., fail to render at all,
// resulting in a blank screen).
//
// Set these in Vercel: Project Settings -> Environment Variables
//   SITE_USERNAME
//   SITE_PASSWORD
//   AUTH_SECRET (optional but recommended — any long random string)
//
// If SITE_USERNAME/SITE_PASSWORD are unset, the site is left open (so local
// `npm run dev` doesn't require credentials) — make sure both are set in Vercel.

export async function middleware(request) {
  const expectedUser = process.env.SITE_USERNAME;
  const expectedPass = process.env.SITE_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const secret = process.env.AUTH_SECRET || expectedPass;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (token && (await verifyToken(token, secret))) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
