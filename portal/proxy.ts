import { auth } from "@/lib/auth";

export const proxy = auth;

export const config = {
  matcher: ["/dashboard/:path*", "/api/keys/:path*", "/api/usage/:path*"],
};
