// Transporte SMTP (nodemailer). Variables: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
export async function createMailer(env = process.env) {
  const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, SMTP_FROM } = env;
  if (!SMTP_HOST || !SMTP_FROM) return null;
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  return (mail) => transport.sendMail({ from: SMTP_FROM, to: mail.to, subject: mail.subject, text: mail.text });
}
