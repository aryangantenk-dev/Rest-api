import nodemailer, { type Transporter } from "nodemailer";
import { OTP_TTL_SEC, SMTP } from "./config";
import { SITE_NAME } from "@/lib/site";

const g = globalThis as typeof globalThis & { __yanzMailer?: Transporter };

function mailer(): Transporter {
  return (g.__yanzMailer ??= nodemailer.createTransport({
    host: SMTP.host,
    port: SMTP.port,
    // Port 465 langsung TLS; port lain (587) mulai polos lalu naik ke TLS (STARTTLS).
    secure: SMTP.port === 465,
    auth: { user: SMTP.user, pass: SMTP.pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  }));
}

/** Kirim kode masuk. Melempar Error bila server email menolak atau tidak bisa dihubungi. */
export async function sendOtpEmail(to: string, code: string, origin: string): Promise<void> {
  const minutes = Math.round(OTP_TTL_SEC / 60);
  const host = origin.replace(/^https?:\/\//, "");
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  await mailer().sendMail({
    from: { name: SITE_NAME, address: SMTP.from },
    to,
    subject: `${code} adalah kode masuk ${SITE_NAME}`,
    text: [
      `Kode masuk ${SITE_NAME}: ${code}`,
      "",
      `Masukkan kode ini di halaman login ${host}. Kode berlaku ${minutes} menit dan hanya bisa dipakai sekali.`,
      "",
      "Kalau kamu tidak sedang mencoba masuk, abaikan email ini. Jangan berikan kode ini kepada siapa pun.",
    ].join("\n"),
    html: `<!doctype html><html lang="id"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #d5dce5">
<tr><td style="padding:24px 24px 8px;font-size:18px;font-weight:bold;font-family:Consolas,Menlo,monospace">${SITE_NAME}</td></tr>
<tr><td style="padding:8px 24px;font-size:16px;line-height:1.5">Kode masuk kamu:</td></tr>
<tr><td style="padding:8px 24px"><div style="padding:16px;border:1px solid #64748b;background:#f8fafc;font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:bold;letter-spacing:4px;text-align:center">${spaced}</div></td></tr>
<tr><td style="padding:8px 24px;font-size:16px;line-height:1.5">Masukkan kode ini di halaman login ${host}. Kode berlaku ${minutes} menit dan hanya bisa dipakai sekali.</td></tr>
<tr><td style="padding:8px 24px 24px;font-size:14px;line-height:1.5;color:#475569">Kalau kamu tidak sedang mencoba masuk, abaikan email ini. Jangan berikan kode ini kepada siapa pun.</td></tr>
</table></td></tr></table></body></html>`,
  });
}
