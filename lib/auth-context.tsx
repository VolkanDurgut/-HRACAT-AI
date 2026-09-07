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

// ----------------------------------------------------------------------------
// SÜPER ADMİN E-POSTALARI — Yetkilendirme (kullanıcı izinleri yönetim) sayfası
// SADECE bu e-postalarla giriş yapan hesaplarda görünür/erişilebilir olmalı.
// "ayarlar" sayfa yetkisi (kullanici_yetkileri.sayfa_yetkileri.ayarlar) artık bu
// sayfaya erişim için YETERLİ DEĞİL — o alan başka amaçlarla DB'de kalabilir,
// ama gerçek erişim kontrolü burada, kod seviyesinde sabitlenmiş e-posta
// listesiyle yapılır. Değiştirmek isterseniz sadece bu listeyi güncelleyin.
// ----------------------------------------------------------------------------
const SUPER_ADMIN_EMAILS = [
  "volkandurgut.tr@gmail.com",
  "buraktuncay@unex.com.tr",
];

const SUPER_ADMIN_EMAILS_LOWER = SUPER_ADMIN_EMAILS.map(e => e.toLowerCase());

export function isSuperAdmin(email?: string | null): boolean {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS_LOWER.includes(email.trim().toLowerCase());
}

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
  companyId: string | null; // Şirket bazlı izolasyon için eklendi
  yetkiler: KullaniciYetkileri;
  isSuperAdmin: boolean; // Yetkilendirme sayfasına erişim — sabit e-posta listesine göre
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  rol: null,
  companyId: null, // Şirket bazlı izolasyon için eklendi
  yetkiler: VARSAYILAN_YETKILER,
  isSuperAdmin: false,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [rol, setRol] = useState<Rol>(null);
  const [companyId, setCompanyId] = useState<string | null>(null); // Şirket state'i eklendi
  const [yetkiler, setYetkiler] = useState<KullaniciYetkileri>(VARSAYILAN_YETKILER);

  // ÖNEMLİ — RACE CONDITION DÜZELTMESİ:
  // Bu fonksiyon artık "loading" bayrağını YÖNETMİYOR; sadece veriyi çekip
  // state'e yazıyor ve Promise'i geri döndürüyor. Çağıran taraf (useEffect
  // içindeki iki akış), bu Promise TAMAMLANMADAN "setLoading(false)"
  // ÇAĞIRMAMALI. Aksi halde `yetkiler` hâlâ VARSAYILAN_YETKILER (izin
  // bazında neredeyse hepsi true) iken sayfa "yükleniyor" ekranından çıkıp
  // içeriği gösteriyor — kısıtlı bir kullanıcı, gerçek (kısıtlayıcı) izinler
  // veritabanından gelene kadarki o kısa pencerede tam yetkiliymiş gibi
  // davranan bir arayüz görüyordu. Aşağıdaki değişiklikle "loading" sadece
  // hem oturum hem GERÇEK yetkiler tam olarak belli olduğunda false olur.
  const fetchRolVeYetkiler = async (userId: string) => {
    try {
      const [rolRes, yetkiRes] = await Promise.all([
        // Kritik Değişiklik: "rol" bilgisinin yanına veritabanına eklediğimiz "company_id" kolonunu da ekledik
        supabase.from("kullanici_rolleri").select("rol, company_id").eq("user_id", userId).single(),
        supabase.from("kullanici_yetkileri").select("sayfa_yetkileri, sekme_yetkileri").eq("user_id", userId).single(),
      ]);
      setRol((rolRes.data?.rol as Rol) ?? null);
      setCompanyId(rolRes.data?.company_id ?? null); // Şirket ID'si state'e yazıldı
      if (yetkiRes.data) {
        setYetkiler({
          sayfa_yetkileri: { ...VARSAYILAN_YETKILER.sayfa_yetkileri, ...yetkiRes.data.sayfa_yetkileri },
          sekme_yetkileri: { ...VARSAYILAN_YETKILER.sekme_yetkileri, ...yetkiRes.data.sekme_yetkileri },
        });
      } else {
        // Kayıt bulunamadıysa (örn. yeni kullanıcı, henüz trigger çalışmadıysa)
        // GÜVENLİ TARAF: varsayılan (geniş yetkili) obje yerine HER ŞEYİ KAPALI
        // bir obje kullanılır. Böylece bir DB hatası/gecikmesi asla fazladan
        // yetki sızdırmaz; olsa olsa kullanıcı geçici olarak hiçbir sayfayı
        // göremez ki bu, tersinden çok daha güvenli bir varsayılan.
        setYetkiler({
          sayfa_yetkileri: {
            dashboard: false, panel: false, yeni_dosya: false, ihracatlar: false,
            kantar: false, analiz: false, ayarlar: false, etd_eta: false,
          },
          sekme_yetkileri: { proforma: false, evraklar: false, rezervasyon: false, konteynerler: false },
        });
      }
    } catch (err) {
      console.error("fetchRolVeYetkiler hata:", err);
      // Hata durumunda da güvenli taraf: erişimi genişletme, daraltma.
      setYetkiler({
        sayfa_yetkileri: {
          dashboard: false, panel: false, yeni_dosya: false, ihracatlar: false,
          kantar: false, analiz: false, ayarlar: false, etd_eta: false,
        },
        sekme_yetkileri: { proforma: false, evraklar: false, rezervasyon: false, konteynerler: false },
      });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchRolVeYetkiler(session.user.id); // artık BEKLENİYOR
      }
      setLoading(false); // yetkiler tam yüklendikten SONRA loading kapanır
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchRolVeYetkiler(session.user.id); // artık BEKLENİYOR
        } else {
          setRol(null);
          setCompanyId(null); // Çıkış yapıldığında şirket bilgisi de sıfırlandı
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
    try {
      await supabase.auth.signOut();
      setRol(null);
      setYetkiler(VARSAYILAN_YETKILER);
      
      // Global yönlendirme döngülerini kırmak ve direkt ana sayfaya (landing) uçurmak için:
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error) {
      console.error("Oturum kapatılırken hata oluştu:", error);
    }
  };

  return (
    // State'e aldığımız companyId'yi buraya ekleyerek tüm alt bileşenlerin kullanımına açıyoruz
    <AuthContext.Provider
      value={{ user, session, loading, rol, companyId, yetkiler, isSuperAdmin: isSuperAdmin(user?.email), signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);