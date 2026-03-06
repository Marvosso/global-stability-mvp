"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabaseBrowserClient } from "@/lib/supabaseBrowserClient";

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateSession = useCallback((session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        updateSession(null);
        setIsLoading(false);
      }
    }, 8000);

    try {
      supabaseBrowserClient.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (!cancelled) {
            window.clearTimeout(timeoutId);
            updateSession(session);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            window.clearTimeout(timeoutId);
            updateSession(null);
            setIsLoading(false);
          }
        });
    } catch {
      if (!cancelled) {
        window.clearTimeout(timeoutId);
        updateSession(null);
        setIsLoading(false);
      }
    }

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabaseBrowserClient.auth.onAuthStateChange((_event, session) => {
        updateSession(session);
      });
      subscription = data.subscription;
    } catch {
      // Client not available (e.g. env missing)
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [updateSession]);

  return (
    <SessionContext.Provider value={{ session, user, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (ctx === null) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
