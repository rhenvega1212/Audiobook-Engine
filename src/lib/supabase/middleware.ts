import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getHomePathForEmail, isAdminEmail } from "@/lib/auth/admin-edge";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse
) {
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-")) {
      response.cookies.set(name, "", { maxAge: 0, path: "/" });
    }
  }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user: Awaited<
    ReturnType<typeof supabase.auth.getUser>
  >["data"]["user"] = null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      clearSupabaseAuthCookies(request, supabaseResponse);
    } else {
      user = data.user;
    }
  } catch {
    // Supabase unreachable or stale session — don't block page loads.
    clearSupabaseAuthCookies(request, supabaseResponse);
    user = null;
  }

  const pathname = request.nextUrl.pathname;
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/auth");
  const isAdminRoute = pathname.startsWith("/admin");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const home = getHomePathForEmail(user.email);

    if (pathname === "/login" || pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }

    if (isAdminRoute && !isAuthRoute) {
      const superAdmin = isAdminEmail(user.email);
      let teamManager = false;
      if (!superAdmin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const service = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } }
        );
        const { data } = await service
          .from("team_manager_grants")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        teamManager = !!data;
      }

      if (!superAdmin && !teamManager) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
