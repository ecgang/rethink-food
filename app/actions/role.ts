"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ROLE_COOKIE, isRoleKey, type RoleKey } from "@/lib/roles";

/** Switch the active role (cookie-backed). Re-renders all routes. */
export async function setRole(role: RoleKey): Promise<void> {
  if (!isRoleKey(role)) return;
  const store = await cookies();
  store.set(ROLE_COOKIE, role, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}
