import { SMTP_FROM } from "core-kit/packages/mailer/consts";
import { convert as toText } from "html-to-text";
import mailer from "./mailer";

export async function sendEmail(to: string, subject: string, message: string) {
  await mailer.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text: toText(message),
    html: message,
  });
}
