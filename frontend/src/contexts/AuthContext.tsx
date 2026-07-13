import React, { createContext, useContext, useState, useEffect } from 'react';
import { storage } from '@/src/utils/storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  email: string;
  family_name: string;
  nb_children: number;
  children_ages: number[];
  mopado_dollars: number;
  badges: string[];
  completed_episodes: string[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, familyName: string, nbChildren: number, childrenAges: number[]) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await storage.secureGet('auth_token', null);
      const storedUser = await storage.getItem('user', null);
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(storedUser);
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Invalid credentials');
    }

    const data = await response.json();
    
    await storage.secureSet('auth_token', data.token);
    await storage.setItem('user', data.user);
    
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (
    email: string,
    password: string,
    familyName: string,
    nbChildren: number,
    childrenAges: number[]
  ) => {
    const response = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        family_name: familyName,
        nb_children: nbChildren,
        children_ages: childrenAges,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration failed');
    }

    const data = await response.json();
    
    await storage.secureSet('auth_token', data.token);
    await storage.setItem('user', data.user);
    
    setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    await storage.secureRemove('auth_token');
    await storage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!user || !token) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/family/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const updatedUser = await response.json();
        setUser(updatedUser);
        await storage.setItem('user', updatedUser);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
