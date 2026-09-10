// Ports backend/app/email.py exactly: with no SMTP host configured, logs to console instead
// of sending -- lets the whole password-reset flow be built/tested with no real provider.
import nodemailer from "nodemailer";

import { settings } from "./config.js";

export async function sendEmail(toEmail: string, subject: string, body: string): Promise<void> {
  if (!settings.smtpHost) {
    console.log(`DEV EMAIL (no SMTP configured) -> to=${toEmail} subject=${JSON.stringify(subject)}\n${body}`);
    return;
  }

  const transport = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: false,
    requireTLS: true,
    auth: settings.smtpUsername ? { user: settings.smtpUsername, pass: settings.smtpPassword } : undefined,
  });

  await transport.sendMail({
    from: settings.smtpFromEmail,
    to: toEmail,
    subject,
    text: body,
  });
}
