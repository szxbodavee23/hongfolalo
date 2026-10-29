// Email Verification Sender (Supports Resend API, Brevo API, Native SMTP over TLS, and Admin Outbox Log)
import tls from 'tls';
import net from 'net';

export const recentOutboxEmails = [];

function recordOutbox(to, subject, code, verifyUrl, deliveryStatus) {
  recentOutboxEmails.unshift({
    to,
    subject,
    code,
    verifyUrl,
    deliveryStatus,
    sentAt: new Date().toISOString()
  });
  if (recentOutboxEmails.length > 50) {
    recentOutboxEmails.pop();
  }
}

export async function sendVerificationEmail({ toEmail, username, code, baseUrl }) {
  const cleanEmail = String(toEmail || '').trim();
  const verifyUrl = `${baseUrl}/api/auth/verify-link?email=${encodeURIComponent(cleanEmail)}&code=${encodeURIComponent(code)}`;
  const subject = `Honfoglaló – E-mail cím megerősítése (Kód: ${code})`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #221307; color: #fdf3dc; padding: 28px; border-radius: 14px; border: 2px solid #d49b27;">
      <h2 style="color: #f5c445; margin-top: 0;">Honfoglaló – Regisztráció Megerősítése</h2>
      <p>Kedves <strong>${username}</strong>!</p>
      <p>Köszönjük a regisztrációdat! A fiókod aktiválásához és a botolás elleni védelemhez kérlek írd be az alábbi 6 jegyű megerősítő kódot a weboldalon:</p>
      <div style="background: #140a03; border: 2px solid #f5c445; border-radius: 10px; padding: 14px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #f7c948; margin: 20px 0;">
        ${code}
      </div>
      <p>Vagy kattints közvetlenül az alábbi megerősítő gombra:</p>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${verifyUrl}" style="background: #f5c445; color: #261405; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 999px; display: inline-block;">
          E-mail Cím Megerősítése
        </a>
      </p>
      <p style="font-size: 12px; color: #a68b5b;">Ha nem te kezdeményezted a regisztrációt, kérlek hagyd figyelmen kívül ezt az üzenetet.</p>
    </div>
  `;

  return deliverMail({ cleanEmail, username, subject, htmlBody, code, verifyUrl });
}

export async function sendPasswordResetEmail({ toEmail, username, code }) {
  const cleanEmail = String(toEmail || '').trim();
  const subject = `Honfoglaló – Elfelejtett jelszó (Kód: ${code})`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #221307; color: #fdf3dc; padding: 28px; border-radius: 14px; border: 2px solid #d49b27;">
      <h2 style="color: #f5c445; margin-top: 0;">Honfoglaló – Jelszó Visszaállítása</h2>
      <p>Kedves <strong>${username}</strong>!</p>
      <p>Elfelejtett jelszó visszaállítást kértek a fiókodhoz. Írd be az alábbi 6 jegyű visszaállító kódot a weboldalon, majd adj meg egy új jelszót:</p>
      <div style="background: #140a03; border: 2px solid #f5c445; border-radius: 10px; padding: 14px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #f7c948; margin: 20px 0;">
        ${code}
      </div>
      <p>A kód <strong>15 percig</strong> érvényes.</p>
      <p style="font-size: 12px; color: #a68b5b;">Ha nem te kérted a visszaállítást, kérlek hagyd figyelmen kívül ezt az üzenetet – a jelszavad nem változik meg.</p>
    </div>
  `;

  return deliverMail({ cleanEmail, username, subject, htmlBody, code, verifyUrl: null });
}

// Shared delivery logic: Resend API -> Brevo API -> raw SMTP -> console/outbox fallback
async function deliverMail({ cleanEmail, username, subject, htmlBody, code, verifyUrl }) {
  // 1. Check Resend HTTP API (Recommended for Render.com)
  if (process.env.RESEND_API_KEY) {
    try {
      const fromAddr = process.env.EMAIL_FROM || 'Honfoglaló <onboarding@resend.dev>';
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [cleanEmail],
          subject,
          html: htmlBody
        })
      });
      if (res.ok) {
        recordOutbox(cleanEmail, subject, code, verifyUrl, 'Elküldve (Resend API)');
        return { sent: true, provider: 'resend' };
      }
      const errBody = await res.text().catch(() => '');
      console.warn(`[Mailer] Resend API rejected (${res.status}): ${errBody.slice(0, 400)}`);
      recordOutbox(cleanEmail, subject, code, verifyUrl, `Resend elutasítva (${res.status})`);
    } catch (err) {
      console.warn('[Mailer] Resend API error:', err.message);
      recordOutbox(cleanEmail, subject, code, verifyUrl, 'Resend hálózati hiba');
    }
  }

  // 2. Check Brevo HTTP API
  if (process.env.BREVO_API_KEY) {
    try {
      const senderEmail = process.env.EMAIL_FROM || 'noreply@honfoglalo.site';
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sender: { name: 'Honfoglaló', email: senderEmail },
          to: [{ email: cleanEmail, name: username }],
          subject,
          htmlContent: htmlBody
        })
      });
      if (res.ok) {
        recordOutbox(cleanEmail, subject, code, verifyUrl, 'Elküldve (Brevo API)');
        return { sent: true, provider: 'brevo' };
      }
      const errBody = await res.text().catch(() => '');
      console.warn(`[Mailer] Brevo API rejected (${res.status}): ${errBody.slice(0, 400)}`);
      recordOutbox(cleanEmail, subject, code, verifyUrl, `Brevo elutasítva (${res.status})`);
    } catch (err) {
      console.warn('[Mailer] Brevo API error:', err.message);
      recordOutbox(cleanEmail, subject, code, verifyUrl, 'Brevo hálózati hiba');
    }
  }

  // 3. Check SMTP Configuration (SMTP_HOST, SMTP_USER, SMTP_PASS)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      await sendRawSmtp({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: cleanEmail,
        subject,
        htmlBody
      });
      recordOutbox(cleanEmail, subject, code, verifyUrl, 'Elküldve (SMTP)');
      return { sent: true, provider: 'smtp' };
    } catch (err) {
      console.warn('[Mailer] SMTP error:', err.message);
    }
  }

  // 4. Console & Admin Outbox fallback when no external SMTP/API key is configured yet
  console.log(`\n======================================================`);
  console.log(`[EMAIL MEGERŐSÍTŐ KÓD] Címzett: ${cleanEmail} (${username})`);
  console.log(`[KÓD]: ${code}`);
  console.log(`[MEGERŐSÍTŐ LINK]: ${verifyUrl}`);
  console.log(`======================================================\n`);
  recordOutbox(cleanEmail, subject, code, verifyUrl, 'Naplózva (SMTP nincs beállítva)');
  return { sent: false, provider: 'outbox-log' };
}

function sendRawSmtp({ host, port, user, pass, from, to, subject, htmlBody }) {
  return new Promise((resolve, reject) => {
    const useTls = port === 465;
    const socket = useTls
      ? tls.connect({ host, port, rejectUnauthorized: false })
      : net.createConnection({ host, port });

    let step = 0;
    socket.setTimeout(8000, () => {
      socket.destroy();
      reject(new Error('SMTP timeout'));
    });

    const sendLine = line => socket.write(line + '\r\n');

    socket.on('data', chunk => {
      const msg = chunk.toString('utf8');
      const code = parseInt(msg.slice(0, 3), 10);
      if (code >= 400) {
        socket.end();
        return reject(new Error('SMTP error: ' + msg.trim()));
      }

      if (step === 0 && code === 220) {
        step = 1;
        sendLine(`EHLO honfoglalo.site`);
      } else if (step === 1 && code === 250) {
        step = 2;
        sendLine('AUTH LOGIN');
      } else if (step === 2 && code === 334) {
        step = 3;
        sendLine(Buffer.from(user, 'utf8').toString('base64'));
      } else if (step === 3 && code === 334) {
        step = 4;
        sendLine(Buffer.from(pass, 'utf8').toString('base64'));
      } else if (step === 4 && code === 235) {
        step = 5;
        sendLine(`MAIL FROM:<${from}>`);
      } else if (step === 5 && code === 250) {
        step = 6;
        sendLine(`RCPT TO:<${to}>`);
      } else if (step === 6 && code === 250) {
        step = 7;
        sendLine('DATA');
      } else if (step === 7 && code === 354) {
        step = 8;
        const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
        const emailData = [
          `From: "Honfoglalo" <${from}>`,
          `To: <${to}>`,
          `Subject: ${encodedSubject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=UTF-8',
          '',
          htmlBody,
          '.'
        ].join('\r\n');
        sendLine(emailData);
      } else if (step === 8 && code === 250) {
        step = 9;
        sendLine('QUIT');
        socket.end();
        resolve(true);
      }
    });

    socket.on('error', reject);
  });
}
