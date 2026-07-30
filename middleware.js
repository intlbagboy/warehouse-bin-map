import { NextResponse } from "next/server";

// Simple HTTP Basic Auth gate — works on any Vercel plan (including Hobby/free),
// unlike Vercel's built-in Password Protection which requires a paid add-on.
//
// Set these in Vercel: Project Settings -> Environment Variables
//   SITE_USERNAME
//   SITE_PASSWORD
//
// If either is unset, the site is left open (so local `npm run dev` doesn't
// require credentials) — make sure both are set in your Vercel project.

export function middleware(request) {
  const expectedUser = process.env.SITE_USERNAME;
  const expectedPass = process.env.SITE_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const separatorIndex = decoded.indexOf(":");
      const user = decoded.slice(0, separatorIndex);
      const pass = decoded.slice(separatorIndex + 1);
      if (user === expectedUser && pass === expectedPass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Warehouse Bin Map"',
    },
  });
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
