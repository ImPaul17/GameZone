export interface MemberProfileDTO {
  id: string;
  displayName: string;
  bio: string;
  avatarURL: string | null;
  avatarSource: "discord" | "custom" | "none";
  email: string | null;
}

export type MemberProfile = MemberProfileDTO;
