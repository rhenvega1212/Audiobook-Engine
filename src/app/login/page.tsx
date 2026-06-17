import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/server";
import { getHomePathForEmail } from "@/lib/auth/admin";
import { LoginForm } from "./login-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getServerUser();

  if (user) {
    redirect(getHomePathForEmail(user.email));
  }

  const params = await searchParams;
  const authError = params.error === "auth";

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-burgundy">
            Audiobook Engine
          </h1>
          <p className="mt-2 font-serif text-sm italic text-slate">
            Pour, pair, produce.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-6 text-center text-body-sm text-slate">
              Sign in with your team account
            </p>
            <LoginForm authError={authError} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
