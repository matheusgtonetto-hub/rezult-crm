import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  created_at: string;
}

interface ProfileContextType {
  profile: Profile | null;
  profileLoading: boolean;
  updateProfile: (data: Partial<Pick<Profile, "full_name" | "phone" | "email">>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be within ProfileProvider");
  return ctx;
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    async function load() {
      setProfileLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();

      // full_name from registration is always stored in user_metadata by Supabase Auth
      const metaName: string = user!.user_metadata?.full_name ?? "";
      const authEmail: string = user!.email ?? "";

      if (data) {
        // If the profile row exists but name is missing (signUp upsert failed due to RLS),
        // patch it now that the user is authenticated.
        const needsPatch = !data.full_name && metaName;
        if (needsPatch) {
          await supabase
            .from("profiles")
            .update({ full_name: metaName, email: authEmail })
            .eq("id", user!.id);
          setProfile({ ...data, full_name: metaName, email: authEmail } as Profile);
        } else {
          setProfile(data as Profile);
        }
      } else {
        // No profile row yet — create it using auth metadata
        const name = metaName || authEmail.split("@")[0];
        const { data: created } = await supabase
          .from("profiles")
          .insert({ id: user!.id, email: authEmail, full_name: name })
          .select()
          .single();
        if (created) setProfile(created as Profile);
      }
      setProfileLoading(false);
    }

    load();
  }, [user?.id]);

  const updateProfile = useCallback(async (data: Partial<Pick<Profile, "full_name" | "phone" | "email">>) => {
    if (!user) return;
    const { data: updated } = await supabase
      .from("profiles")
      .update(data)
      .eq("id", user.id)
      .select()
      .single();
    if (updated) setProfile(updated as Profile);
  }, [user]);

  const uploadAvatar = useCallback(async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    const { data: updated } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", user.id)
      .select()
      .single();
    if (updated) setProfile(updated as Profile);
  }, [user]);

  return (
    <ProfileContext.Provider value={{ profile, profileLoading, updateProfile, uploadAvatar }}>
      {children}
    </ProfileContext.Provider>
  );
}
