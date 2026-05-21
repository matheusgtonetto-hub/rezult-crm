import type { VercelRequest, VercelResponse } from "@vercel/node";

const CLIENT_ID    = process.env.GOOGLE_CLIENT_ID!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { userId, companyId } = req.query;
  if (!userId || !companyId) {
    return res.status(400).json({ error: "userId e companyId são obrigatórios" });
  }

  const state = Buffer.from(JSON.stringify({ userId, companyId })).toString("base64url");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",     CLIENT_ID);
  url.searchParams.set("redirect_uri",  REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope",         SCOPES);
  url.searchParams.set("access_type",   "offline");
  url.searchParams.set("prompt",        "consent");
  url.searchParams.set("state",         state);

  return res.redirect(302, url.toString());
}
