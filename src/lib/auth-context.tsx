"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { User } from "@/types/user";
import { DriverProfile } from "@/types/driver";
import { LoginRequest, RegisterRequest } from "@/types/auth";
import { authApi } from "./auth-api";
import { MockStorage } from "./mock-storage";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  driverProfile: DriverProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  login: (req: LoginRequest) => Promise<User>;
  register: (req: RegisterRequest) => Promise<User>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Sesi tidak dapat diverifikasi. Coba lagi.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  const applySession = useCallback(
    (session: Awaited<ReturnType<typeof authApi.getCurrentSession>>) => {
      const profile =
        session?.user.role === "DRIVER"
          ? MockStorage.getDriverProfile(session.user.id)
          : null;
      setUser(session?.user || null);
      setDriverProfile(profile);
      MockStorage.setSession(
        session
          ? {
              user: session.user,
              ...(profile ? { driverProfile: profile } : {}),
            }
          : null
      );
    },
    []
  );

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      applySession(await authApi.getCurrentSession());
    } catch (error) {
      setAuthError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    let active = true;
    MockStorage.initDemoData();
    MockStorage.setSession(null);

    authApi
      .getCurrentSession()
      .then((session) => {
        if (active) applySession(session);
      })
      .catch((error: unknown) => {
        if (active) setAuthError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applySession]);

  const login = async (request: LoginRequest): Promise<User> => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const session = await authApi.login(request);
      applySession(session);
      return session.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (request: RegisterRequest): Promise<User> => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const session = await authApi.register(request);
      applySession(session);
      return session.user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await authApi.logout();
      applySession(null);
      setAuthError(null);
      router.replace("/login");
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = () => {
    const session = MockStorage.getSession();
    if (!user || session?.user.id !== user.id) return;

    setUser({
      ...user,
      name: session.user.name,
      phone: session.user.phone,
    });
    if (user.role === "DRIVER") {
      const profile = MockStorage.getDriverProfile(user.id);
      setDriverProfile(profile);
      MockStorage.setSession({
        user: {
          ...user,
          name: session.user.name,
          phone: session.user.phone,
        },
        ...(profile ? { driverProfile: profile } : {}),
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        driverProfile,
        isAuthenticated: !!user,
        isLoading,
        authError,
        login,
        register,
        logout,
        refreshSession,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
