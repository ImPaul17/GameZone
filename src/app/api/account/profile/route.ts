import { patchOwnProfile, readOwnProfile } from "@/modules/accounts/members";
export const runtime = "nodejs";
export const GET = readOwnProfile;
export const PATCH = patchOwnProfile;
