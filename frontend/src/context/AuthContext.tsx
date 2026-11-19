import { createContext, useContext, useState, type ReactNode } from 'react';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: 'SYSTEM_ADMIN' | 'TUTOR' | 'FAMILY';
};

type AuthContextValue = {
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('melihik_user');
    return saved ? JSON.parse(saved) as AuthUser : null;
  });
  const login = (token: string, nextUser: AuthUser) => {
    localStorage.setItem('melihik_access_token', token);
    localStorage.setItem('melihik_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };
  const logout = () => {
    localStorage.removeItem('melihik_access_token');
    localStorage.removeItem('melihik_user');
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
