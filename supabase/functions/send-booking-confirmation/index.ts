import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const dateLabel = (value: string, locale: keyof typeof copy) => new Intl.DateTimeFormat(({
  en: 'en-GB', ar: 'ar-IQ', ckb: 'ar-IQ', kmr: 'ku-Latn-IQ',
})[locale], {
  dateStyle: 'full', timeZone: 'Asia/Baghdad',
}).format(new Date(`${value}T12:00:00+03:00`));

const timeLabel = (value: string | null) => value ? value.slice(0, 5) : '—';
const moneyLabel = (value: number) => new Intl.NumberFormat('en-IQ', {
  maximumFractionDigits: 0,
}).format(value) + ' IQD';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c] ?? c));

const copy = {
  en: {
    subject: 'Your Yarika court booking is confirmed', heading: 'Booking confirmed',
    hello: 'Hello', intro: 'The host has accepted your booking. Your court time is reserved.',
    ref: 'Booking reference', court: 'Court', date: 'Date', time: 'Time',
    duration: 'Duration', hour: 'hours', players: 'Players', total: 'Total', payment: 'Payment',
    cash: 'Cash at the venue', footer: 'Please arrive a little early and show your booking reference to the host.',
  },
  ar: {
    subject: 'تم تأكيد حجزك عبر ياريكا', heading: 'تم تأكيد الحجز',
    hello: 'مرحباً', intro: 'وافق المضيف على حجزك. تم تثبيت وقت الملعب لك.',
    ref: 'رقم الحجز', court: 'الملعب', date: 'التاريخ', time: 'الوقت',
    duration: 'المدة', hour: 'ساعة', players: 'اللاعبون', total: 'الإجمالي', payment: 'الدفع',
    cash: 'نقداً في الملعب', footer: 'يرجى الحضور قبل الموعد بقليل وإبراز رقم الحجز للمضيف.',
  },
  ckb: {
    subject: 'حجزەکەت لە یاریکا پشتڕاستکرایەوە', heading: 'حجزەکەت پشتڕاستکرایەوە',
    hello: 'سڵاو', intro: 'خاوەن یاریگاکە حجزەکەتی پەسەند کرد. کاتی یاریگاکەت بۆ تۆ تەرخان کرا.',
    ref: 'ژمارەی حجز', court: 'یاریگا', date: 'بەروار', time: 'کات',
    duration: 'ماوە', hour: 'کاتژمێر', players: 'یاریکەرەکان', total: 'کۆی گشتی', payment: 'پارەدان',
    cash: 'نەقد لە شوێنەکە', footer: 'تکایە کەمێک پێش کاتەکە بگە و ژمارەی حجزەکەت پیشانی خاوەن یاریگاکە بدە.',
  },
  kmr: {
    subject: 'Rezervasyona te ya Yarika hate pejirandin', heading: 'Rezervasyon hate pejirandin',
    hello: 'Silav', intro: 'Xwediyê meydanê rezervasyona te pejirand. Dema meydanê ji bo te hat veqetandin.',
    ref: 'Hejmara rezervasyonê', court: 'Meydan', date: 'Dîrok', time: 'Dem',
    duration: 'Demjimêr', hour: 'saet', players: 'Lîstikvan', total: 'Tevahî', payment: 'Dayîn',
    cash: 'Perê nexweş li meydanê', footer: 'Ji kerema xwe hinek zû were û hejmara rezervasyonê nîşanî xwediyê meydanê bide.',
  },
} as const;

async function sendViaSmtp({
  host,
  port = 465,
  user,
  pass,
  from,
  to,
  subject,
  html,
}: {
  host: string;
  port?: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}) {
  const conn = await Deno.connectTls({ hostname: host, port });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const toB64 = (s: string) => btoa(Array.from(encoder.encode(s), (b) => String.fromCharCode(b)).join(''));

  async function readChunk(): Promise<string> {
    const buf = new Uint8Array(4096);
    let str = '';
    while (!str.includes('\r\n')) {
      const n = await conn.read(buf);
      if (n === null) break;
      str += decoder.decode(buf.subarray(0, n));
    }
    return str;
  }

  async function sendCmd(command: string, expectedPrefix: string) {
    await conn.write(encoder.encode(command + '\r\n'));
    const resp = await readChunk();
    if (!resp.startsWith(expectedPrefix)) {
      throw new Error(`SMTP Error [${command.slice(0, 4)}]: ${resp.trim()}`);
    }
    return resp;
  }

  try {
    const banner = await readChunk();
    if (!banner.startsWith('220')) throw new Error(`Invalid SMTP banner: ${banner}`);

    await sendCmd('EHLO localhost', '250');
    await sendCmd('AUTH LOGIN', '334');
    await sendCmd(toB64(user), '334');
    await sendCmd(toB64(pass), '235');

    const fromAddr = from.includes('<') ? from.match(/<([^>]+)>/)?.[1] ?? from : from;
    const toAddr = to.includes('<') ? to.match(/<([^>]+)>/)?.[1] ?? to : to;

    await sendCmd(`MAIL FROM:<${fromAddr}>`, '250');
    await sendCmd(`RCPT TO:<${toAddr}>`, '250');
    await sendCmd('DATA', '354');

    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${toB64(subject)}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      '',
      toB64(html),
      '.',
    ].join('\r\n');

    await sendCmd(rawMessage, '250');
    await sendCmd('QUIT', '221');
  } finally {
    try {
      conn.close();
    } catch (_) {}
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Authentication required' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
    const resendFrom = Deno.env.get('RESEND_FROM_EMAIL') ?? '';
    const smtpHost = Deno.env.get('SMTP_HOST') ?? '';
    const smtpPort = Number(Deno.env.get('SMTP_PORT') ?? '465');
    const smtpUser = Deno.env.get('SMTP_USER') ?? '';
    const smtpPass = Deno.env.get('SMTP_PASS') ?? '';
    const smtpFrom = Deno.env.get('SMTP_FROM') ?? 'Yarika <noreply@yarika.online>';

    const hasResend = !!(resendKey && resendFrom);
    const hasSmtp = !!(smtpHost && smtpUser && smtpPass);

    if (!hasResend && !hasSmtp) {
      return json({ error: 'Yarika email delivery needs an SMTP provider (SMTP_HOST/SMTP_USER/SMTP_PASS) or a Resend API key (RESEND_API_KEY/RESEND_FROM_EMAIL)' }, 503);
    }

    const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await userClient.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Invalid session' }, 401);

    const { booking_id: bookingId } = await req.json();
    if (typeof bookingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(bookingId)) {
      return json({ error: 'A valid booking ID is required' }, 400);
    }

    const { data: booking, error: bookingError } = await admin.from('bookings')
      .select('id, listing_id, guest_user_id, booking_date, checkin_date, start_time, end_time, hours, guests, total_price, host_payout_gross, status')
      .eq('id', bookingId)
      .eq('status', 'confirmed')
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return json({ error: 'Confirmed booking not found for this host' }, 404);

    const { data: listing, error: listingError } = await admin.from('listings')
      .select('title, host_user_id')
      .eq('id', booking.listing_id)
      .eq('host_user_id', auth.user.id)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing) return json({ error: 'Confirmed booking not found for this host' }, 404);

    const { data: guestAuth, error: guestAuthError } = await admin.auth.admin.getUserById(booking.guest_user_id);
    if (guestAuthError) throw guestAuthError;
    const to = guestAuth.user?.email;
    if (!to) return json({ error: 'Guest email address is missing' }, 422);

    const language = guestAuth.user?.user_metadata?.language;
    const locale = (['ar', 'ckb', 'kmr'].includes(language) ? language : 'en') as keyof typeof copy;
    const text = copy[locale];
    const firstName = guestAuth.user?.user_metadata?.first_name || '';
    const date = dateLabel(booking.booking_date ?? booking.checkin_date, locale);
    const time = `${timeLabel(booking.start_time)} – ${timeLabel(booking.end_time)}`;
    const duration = `${Number(booking.hours ?? 0)} ${text.hour}`;
    const amount = moneyLabel(Number(booking.total_price ?? booking.host_payout_gross ?? 0));
    const details = [
      [text.ref, booking.id.slice(0, 8).toUpperCase()],
      [text.court, listing?.title ?? 'Yarika court'],
      [text.date, date], [text.time, time], [text.duration, duration],
      [text.players, String(booking.guests)], [text.total, amount], [text.payment, text.cash],
    ];
    const rows = details.map(([label, value]) => `<tr><td style="padding:10px 12px;color:#667085;border-bottom:1px solid #edf0f2">${esc(label)}</td><td style="padding:10px 12px;font-weight:600;text-align:right;border-bottom:1px solid #edf0f2">${esc(value)}</td></tr>`).join('');
    const direction = locale === 'ar' || locale === 'ckb' ? 'rtl' : 'ltr';
    const html = `<div dir="${direction}" style="background:#f5f7f6;padding:32px 12px;font-family:Arial,sans-serif;color:#18221c"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e6ebe7;border-radius:18px;overflow:hidden"><div style="padding:24px 30px;background:#135c3b;color:white;font-size:22px;font-weight:700">Yarika</div><div style="padding:30px"><p style="margin:0 0 8px;color:#567264;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px">${esc(text.subject)}</p><h1 style="margin:0 0 18px;font-size:27px">${esc(text.heading)}</h1><p>${esc(text.hello)}${firstName ? ` ${esc(firstName)}` : ''},</p><p style="line-height:1.6">${esc(text.intro)}</p><table style="width:100%;border-collapse:collapse;margin:24px 0">${rows}</table><p style="font-size:14px;line-height:1.6;color:#667085">${esc(text.footer)}</p></div><div style="padding:18px 30px;background:#f9fbf9;color:#667085;font-size:12px">Yarika · Kurdistan Region of Iraq</div></div></div>`;

    if (hasResend) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: resendFrom, to: [to], subject: text.subject, html }),
      });
      if (!emailResponse.ok) {
        const errorBody = await emailResponse.text();
        console.error('Resend rejected booking email:', emailResponse.status, errorBody);
        return json({ error: 'Booking accepted, but the confirmation email could not be sent' }, 502);
      }
    } else {
      await sendViaSmtp({
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom,
        to,
        subject: text.subject,
        html,
      });
    }

    return json({ success: true, recipient: to, provider: hasResend ? 'resend' : 'smtp' });
  } catch (error) {
    console.error('send-booking-confirmation failed', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error' }, 500);
  }
});
