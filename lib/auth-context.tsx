"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Session, User } from "@supabase/supabase-js";

type Rol = "admin" | "ihracat" | "sevkiyat" | "muhasebe" | "kantar" | "uretim" | null;

export type SayfaYetkileri = {
  dashboard: boolean;
  panel: boolean;
  yeni_dosya: boolean;
  ihracatlar: boolean;
  kantar: boolean;
  analiz: boolean;
  ayarlar: boolean;
  etd_eta: boolean;
};

export type SekmeYetkileri = {
  proforma: boolean;
  evraklar: boolean;
  rezervasyon: boolean;
  konteynerler: boolean;
};

export type KullaniciYetkileri = {
  sayfa_yetkileri: SayfaYetkileri;
  sekme_yetkileri: SekmeYetkileri;
};

const VARSAYILAN_YETKILER: KullaniciYetkileri = {
  sayfa_yetkileri: {
    dashboard: true,
    panel: true,
    yeni_dosya: true,
    ihracatlar: true,
    kantar: true,
    analiz: true,
    ayarlar: false,
    etd_eta: true,
  },
  sekme_yetkileri: {
    proforma: true,
    evraklar: true,
    rezervasyon: true,
    konteynerler: true,
  },
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  rol: Rol;
  yetkiler: KullaniciYetkileri;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  rol: null,
  yetkiler: VARSAYILAN_YETKILER,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rol, setRol] = useState<Rol>(null);
  const [yetkiler, setYetkiler] = useState<KullaniciYetkileri>(VARSAYILAN_YETKILER);

  const fetchRolVeYetkiler = async (userId: string) => {
    const [rolRes, yetkiRes] = await Promise.all([
      supabase.from("kullanici_rolleri").select("rol").eq("user_id", userId).single(),
      supabase.from("kullanici_yetkileri").select("sayfa_yetkileri, sekme_yetkileri").eq("user_id", userId).single(),
    ]);
    setRol((rolRes.data?.rol as Rol) ?? null);
    if (yetkiRes.data) {
      setYetkiler({
        sayfa_yetkileri: { ...VARSAYILAN_YETKILER.sayfa_yetkileri, ...yetkiRes.data.sayfa_yetkileri },
        sekme_yetkileri: { ...VARSAYILAN_YETKILER.sekme_yetkileri, ...yetkiRes.data.sekme_yetkileri },
      });
    } else {
      setYetkiler(VARSAYILAN_YETKILER);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchRolVeYetkiler(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchRolVeYetkiler(session.user.id);
        } else {
          setRol(null);
          setYetkiler(VARSAYILAN_YETKILER);
        }
        setLoading(false);
      }
    );

    const interval = setInterval(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) fetchRolVeYetkiler(session.user.id);
      });
    }, 60000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "E-posta veya şifre hatalı." };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRol(null);
    setYetkiler(VARSAYILAN_YETKILER);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, rol, yetkiler, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);