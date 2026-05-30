import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";

export async function proxy() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/auth", process.env.AUTH_URL ?? "http://localhost:3000"));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/keys/:path*", "/api/usage/:path*"],
};
