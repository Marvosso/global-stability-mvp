"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/auth/SessionProvider";
import { getRoleFromUser } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AdminGuardProps = {
  allowedRoles: string[];
  children: React.ReactNode;
};

export function AdminGuard({ allowedRoles, children }: AdminGuardProps) {
  const router = useRouter();
  const { session, user, isLoading } = useSession();
  const role = getRoleFromUser(user);
  const hasAllowedRole = role !== null && allowedRoles.includes(role);

  useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (!hasAllowedRole) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>
              Your account does not have permission to view this area.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/">Go to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
