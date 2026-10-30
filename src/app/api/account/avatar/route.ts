import { readOwnAvatar, resetOwnAvatar, uploadOwnAvatar } from "@/modules/accounts/members";
export const runtime = "nodejs";
export const GET = readOwnAvatar;
export const POST = uploadOwnAvatar;
export const DELETE = resetOwnAvatar;
