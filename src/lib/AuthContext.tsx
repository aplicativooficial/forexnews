import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  logout: () => Promise<void>;
  setLocalAdmin: (status: boolean) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  logout: async () => {},
  setLocalAdmin: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocalAdmin, setIsLocalAdmin] = useState(false);

  // Consider as admin the specific email provided or local login
  const isAdmin = user?.email === 'fabioamoriellocontato@gmail.com' || isLocalAdmin;

  useEffect(() => {
    // Check if we have a persisted local admin session
    const persistedAdmin = localStorage.getItem('forex_local_admin') === 'true';
    if (persistedAdmin) {
      setIsLocalAdmin(true);
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const setLocalAdmin = (status: boolean) => {
    setIsLocalAdmin(status);
    if (status) {
      localStorage.setItem('forex_local_admin', 'true');
    } else {
      localStorage.removeItem('forex_local_admin');
    }
  };

  const logout = async () => {
    await signOut(auth);
    setLocalAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, logout, setLocalAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}
