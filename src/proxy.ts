import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// The local Screaming Frog agent (Phase 2) authenticates with its own bearer
// token against /api/agent/*, not the dashboard's shared password.
const AGENT_PATH_PREFIX = "/api/agent/";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(AGENT_PATH_PREFIX)) {
    return checkAgentAuth(request);
  }

  return checkBasicAuth(request);
}

function checkAgentAuth(request: NextRequest) {
  const token = process.env.AGENT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "AGENT_TOKEN is not configured on the server" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${token}`) {
    return NextResponse.next();
  }

  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function checkBasicAuth(request: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) {
    return NextResponse.json(
      { error: "BASIC_AUTH_PASSWORD is not configured on the server" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
    const suppliedPassword = decoded.split(":")[1];
    if (suppliedPassword === password) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Meta Audit"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
