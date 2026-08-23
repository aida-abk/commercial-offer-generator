import { cookies } from "next/headers";

export const SESSION_COOKIE = "kp_session";

export function getAppPassword(): string {
  return process.env.APP_PASSWORD ?? "";
}

export function verifyPassword(password: string): boolean {
  const expected = getAppPassword();
  if (!expected) {
    return false;
  }
  return password === expected;
}

export async function isAuthenticated(): Promise<boolean> {
  const expected = getAppPassword();
  if (!expected) {
    return false;
  }
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  return session === expected;
}

export function sessionCookieValue(password: string): string {
  return password;
}
