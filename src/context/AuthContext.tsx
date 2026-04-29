import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  pendingPasswordReset: boolean;
  clearPendingPasswordReset: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{
    error: string | null;
    needsConfirmation: boolean;
    resentConfirmation?: boolean;
  }>;
  resendConfirmation: (email: string) => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession]                           = useState<Session | null>(null);
  const [loading, setLoading]                           = useState(true);
  const [pendingPasswordReset, setPendingPasswordReset] = useState(false);

  useEffect(() => {
    let active = true;
    // Tracks whether the current sign-out was triggered by us (email confirmation flow)
    let isConfirmationSignOut = false;

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams   = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const pkceCode     = searchParams.get("code");
    const hashToken    = hashParams.get("access_token");
    const hashType     = hashParams.get("type");
    const isCallback   = Boolean(pkceCode || hashToken);

    // Subscription must be set up before the async exchange so it catches the event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return;

      // Our own sign-out after email confirmation — just clear session and finish loading.
      if (isConfirmationSignOut && event === "SIGNED_OUT") {
        setSession(null);
        setLoading(false);
        return;
      }

      if (isCallback && pkceCode) {
        if (event === "SIGNED_IN") {
          // Only treat as email confirmation if the user just confirmed their email
          // (email_confirmed_at set within the last 60 seconds and provider is email).
          const confirmedAt = s?.user?.email_confirmed_at;
          const isRecentConfirmation =
            confirmedAt &&
            Date.now() - new Date(confirmedAt).getTime() < 60_000;

          if (isRecentConfirmation) {
            // Don't auto-login: sign out immediately so the user logs in manually.
            // The login page will read sessionStorage and show the success banner.
            isConfirmationSignOut = true;
            sessionStorage.setItem("email_confirmed", "true");
            setTimeout(() => supabase.auth.signOut(), 0);
            return;
          }
          // Not a fresh email confirmation (e.g. magic link re-use) — keep session.
          setSession(s);
          setLoading(false);
          return;
        }
        if (event === "PASSWORD_RECOVERY") {
          setSession(s);
          setPendingPasswordReset(true);
          setLoading(false);
          return;
        }
      }

      setSession(s);
    });

    (async () => {
      if (pkceCode) {
        await supabase.auth.exchangeCodeForSession(pkceCode);
        if (!active) return;
        // Clean the code from the URL; onAuthStateChange handles all routing.
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }

      // Normal startup or implicit-flow callback (hash-based token)
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);

      // Implicit flow: detect recovery type from hash params directly
      if (data.session && isCallback && hashToken && hashType === "recovery") {
        setPendingPasswordReset(true);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearPendingPasswordReset = () => setPendingPasswordReset(false);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const name = fullName?.trim() || email.split("@")[0];
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        // Redirect to /login so the user sees the confirmation success banner
        // and must log in manually — prevents auto-login after email confirmation.
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) return { error: error.message, needsConfirmation: false };

    // Supabase returns identities:[] for duplicate emails without erroring.
    if ((data.user?.identities?.length ?? 1) === 0) {
      await supabase.auth.resend({ type: "signup", email });
      return { error: null, needsConfirmation: true, resentConfirmation: true };
    }

    if (data.user) {
      await supabase.from("profiles").upsert({ id: data.user.id, email, full_name: name });
    }

    // Session returned immediately → "Confirm email" is disabled in Supabase.
    if (data.session) {
      setSession(data.session);
      return { error: null, needsConfirmation: false };
    }

    return { error: null, needsConfirmation: true };
  };

  const resendConfirmation = async (email: string): Promise<void> => {
    await supabase.auth.resend({ type: "signup", email });
  };

  const resetPassword = async (email: string): Promise<string | null> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return error ? error.message : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        pendingPasswordReset,
        clearPendingPasswordReset,
        signIn,
        signUp,
        resendConfirmation,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
