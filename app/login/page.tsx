"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowserClient } from "@/lib/supabaseBrowserClient";
import { useSession } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const { session, isLoading: sessionLoading } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (session) {
      router.replace("/admin");
    }
  }, [session, sessionLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (isSignUp) {
      try {
        const { error: err } = await supabaseBrowserClient.auth.signUp({
          email,
          password,
        });
        if (err) {
          setError(err.message);
          setIsLoading(false);
          return;
        }
        router.replace("/admin");
      } catch (configError) {
        const msg = configError instanceof Error ? configError.message : "Sign-up failed.";
        setError(msg.includes("required") ? "App is not configured for auth. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local." : msg);
        setIsLoading(false);
        return;
      }
    } else {
      try {
        const { error: err } =
          await supabaseBrowserClient.auth.signInWithPassword({
            email,
            password,
          });
        if (err) {
          setError(err.message);
          setIsLoading(false);
          return;
        }
        router.replace("/admin");
      } catch (configError) {
        const msg = configError instanceof Error ? configError.message : "Sign-in failed.";
        setError(msg.includes("required") ? "App is not configured for auth. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local." : msg);
        setIsLoading(false);
        return;
      }
    }
    setIsLoading(false);
  }

  if (sessionLoading || session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <p className="text-muted-foreground">{sessionLoading ? "Loading…" : "Redirecting…"}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isSignUp ? "Sign up" : "Sign in"}</CardTitle>
          <CardDescription>
            {isSignUp
              ? "Create an account to access the admin area."
              : "Sign in to access the admin area."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? isSignUp
                  ? "Signing up…"
                  : "Signing in…"
                : isSignUp
                  ? "Sign up"
                  : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="link"
              className="text-muted-foreground"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
              }}
              disabled={isLoading}
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
