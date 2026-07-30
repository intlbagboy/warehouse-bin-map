import { NextResponse } from "next/server";
import { COOKIE_NAME, createToken } from "../../../lib/auth";

export async function POST(request) {
  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");
  const from = form.get("from") || "/";

  const expectedUser = process.env.SITE_USERNAME;
  const expectedPass = process.env.SITE_PASSWORD;

  if (username !== expectedUser || password !== expectedPass) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    url.searchParams.set("from", from);
    return NextResponse.redirect(url, { status: 303 });
  }

  const secret = process.env.AUTH_SECRET || expectedPass;
  const token = await createToken(username, secret);

  const res = NextResponse.redirect(new URL(from, request.url), { status: 303 });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
