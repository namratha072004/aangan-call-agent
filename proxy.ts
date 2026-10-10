import { NextRequest, NextResponse } from "next/server";

// One shared dashboard password (HTTP Basic, user "aangan"). The voice and Telegram webhooks use their own secrets.
export function proxy(req: NextRequest) {
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) {
    if (process.env.NODE_ENV === "production") return new NextResponse("DASHBOARD_PASSWORD not set", { status: 503 });
    return NextResponse.next();
  }
  const auth = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = auth.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    if (decoded.slice(decoded.indexOf(":") + 1) === pass) return NextResponse.next();
  }
  return new NextResponse("Login required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Aangan dashboard"' } });
}

export const config = {
  matcher: ["/((?!api/qualify|api/telegram|_next/static|_next/image|favicon.ico).*)"],
};
