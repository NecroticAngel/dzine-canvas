/**
 * QR payload builders.
 *
 * A QR code carries a string, and the "type" is really just the shape of that
 * string. Scanners infer the type from a prefix or a grammar — `WIFI:` and
 * `BEGIN:VCARD` are read as WiFi and contact cards by every mainstream phone
 * camera, while a bare `https://…` is a URL. So there is no type field in the
 * code itself; the type is entirely the caller's choice of prefix.
 *
 * Two of these grammars are delimiter-separated and therefore need escaping,
 * which is the only part of this that is easy to get subtly wrong:
 *
 *  - WiFi uses `;` between fields, `:` between key and value, and `\` as the
 *    escape character, so any of those inside an SSID or password has to be
 *    escaped or the scanner reads a shorter value than intended. A password
 *    containing a semicolon is the realistic case; a network called `Café;Bar`
 *    is the annoying one.
 *  - vCard is line-based, with `,`, `;` and `\` significant inside a value, and
 *    newlines inside a value must become a literal `\n`.
 *
 * Escaping is applied here rather than left to the caller so that a value can
 * never be emitted raw by accident.
 */

export type QrPayloadKind =
  | 'url'
  | 'wifi'
  | 'vcard'
  | 'sms'
  | 'email'
  | 'tel'
  | 'text';

/**
 * One flat bag for every kind's inputs. A discriminated union per kind would be
 * stricter, but these values come from uncontrolled-ish form inputs that are
 * empty until touched, so every field is optional anyway and the union would
 * only be pretending.
 */
export type QrPayloadFields = {
  url?: string;
  text?: string;
  ssid?: string;
  password?: string;
  security?: QrWifiSecurity;
  hidden?: boolean;
  firstName?: string;
  lastName?: string;
  organization?: string;
  jobTitle?: string;
  vcardPhone?: string;
  vcardEmail?: string;
  vcardWebsite?: string;
  phone?: string;
  message?: string;
  emailTo?: string;
  subject?: string;
  body?: string;
};

export type QrWifiSecurity = 'WPA' | 'WEP' | 'nopass';

export const WIFI_SECURITIES: { value: QrWifiSecurity; label: string }[] = [
  { value: 'WPA', label: 'WPA/WPA2/WPA3' },
  { value: 'WEP', label: 'WEP' },
  { value: 'nopass', label: 'Open (no password)' },
];

/**
 * Escape a WiFi field.
 *
 * The grammar's own characters are the delimiter set plus the escape character
 * itself, and a double quote because the common Android implementation allows
 * quoting a value and would otherwise be able to close it early.
 */
export const escapeWifi = (value: string): string =>
  value.replace(/[\\;,:"]/g, (char) => `\\${char}`);

/**
 * Escape a vCard value, per RFC 6350 §3.4: backslash first, or the backslashes
 * added for the later characters would themselves be escaped. Newlines become
 * the two-character sequence `\n`.
 */
export const escapeVCard = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

/**
 * Keep only what a dialler can use. People paste numbers with spaces, brackets,
 * dashes and the occasional `tel:` prefix; all of those break a `tel:` URI.
 */
export const normalisePhone = (value: string): string => {
  const trimmed = value.trim().replace(/^tel:/i, '');
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/\D/g, '');
};

/** The value a scanner will act on. Empty when the required fields are missing. */
export const buildQrPayload = (
  kind: QrPayloadKind,
  fields: QrPayloadFields,
): string => {
  switch (kind) {
    case 'url': {
      const value = (fields.url ?? '').trim();
      return value;
    }
    case 'text':
      // Whitespace is significant here, so only an all-blank payload is empty.
      return fields.text ?? '';
    case 'wifi': {
      const ssid = (fields.ssid ?? '').trim();
      if (!ssid) return '';
      const security = fields.security ?? 'WPA';
      // An open network still has to declare `T:nopass` or Android guesses.
      const parts = [
        `T:${security}`,
        `S:${escapeWifi(ssid)}`,
      ];
      if (security !== 'nopass') {
        parts.push(`P:${escapeWifi(fields.password ?? '')}`);
      }
      // Omit `H` entirely when false: some scanners treat `H:false` as *hidden*,
      // because they test the flag's presence rather than its value.
      if (fields.hidden) parts.push('H:true');
      // Trailing `;;` terminates the record; without it some scanners hang.
      return `WIFI:${parts.join(';')};;`;
    }
    case 'vcard': {
      const first = (fields.firstName ?? '').trim();
      const last = (fields.lastName ?? '').trim();
      const organisation = (fields.organization ?? '').trim();
      const title = (fields.jobTitle ?? '').trim();
      const phone = normalisePhone(fields.vcardPhone ?? '');
      const email = (fields.vcardEmail ?? '').trim();
      const website = (fields.vcardWebsite ?? '').trim();
      if (!first && !last && !organisation && !phone && !email && !website) {
        return '';
      }
      const fullName = [first, last].filter(Boolean).join(' ');
      // N and FN are both required by the spec; phones that ignore one use the
      // other, so send both in every case.
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
        `FN:${escapeVCard(fullName || organisation)}`,
      ];
      if (organisation) lines.push(`ORG:${escapeVCard(organisation)}`);
      if (title) lines.push(`TITLE:${escapeVCard(title)}`);
      if (phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(phone)}`);
      if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(email)}`);
      if (website) lines.push(`URL:${escapeVCard(website)}`);
      lines.push('END:VCARD');
      return lines.join('\n');
    }
    case 'sms': {
      const number = normalisePhone(fields.phone ?? '');
      if (!number) return '';
      const message = fields.message ?? '';
      // `SMSTO:` is the de-facto standard; the RFC-5724 `sms:` form is not
      // understood by iOS, which matters more here than being spec-correct.
      return message ? `SMSTO:${number}:${message}` : `SMSTO:${number}`;
    }
    case 'email': {
      const to = (fields.emailTo ?? '').trim();
      if (!to) return '';
      const query: string[] = [];
      if (fields.subject?.trim()) {
        query.push(`subject=${encodeURIComponent(fields.subject.trim())}`);
      }
      if (fields.body?.trim()) {
        query.push(`body=${encodeURIComponent(fields.body)}`);
      }
      const suffix = query.length ? `?${query.join('&')}` : '';
      /**
       * The address is left as typed. `@` is legal unencoded in a `mailto:`,
       * and `mailto:a%40b.com` relies on the reader decoding it — a scanner
       * that just hands the string to a mail app is happier without it. Commas
       * already separate recipients. Only the subject and body are encoded,
       * and there it matters: an `&` in a subject would otherwise truncate the
       * query string.
       */
      return `mailto:${to.replace(/\s/g, '')}${suffix}`;
    }
    case 'tel': {
      const number = normalisePhone(fields.phone ?? '');
      return number ? `tel:${number}` : '';
    }
    default:
      return '';
  }
};

/** Whether `buildQrPayload` would return something worth encoding. */
export const isQrPayloadReady = (
  kind: QrPayloadKind,
  fields: QrPayloadFields,
): boolean => buildQrPayload(kind, fields).trim().length > 0;

/** Short human description of what a payload will do, for the panel's preview. */
export const describeQrPayload = (
  kind: QrPayloadKind,
  fields: QrPayloadFields,
): string => {
  switch (kind) {
    case 'url':
      return 'Opens the link';
    case 'text':
      return 'Shows the text';
    case 'wifi':
      return fields.hidden
        ? 'Joins the hidden network'
        : `Joins “${(fields.ssid ?? '').trim()}”`;
    case 'vcard':
      return 'Saves a contact';
    case 'sms':
      return `Texts ${normalisePhone(fields.phone ?? '')}`;
    case 'email':
      return `Emails ${(fields.emailTo ?? '').trim()}`;
    case 'tel':
      return `Calls ${normalisePhone(fields.phone ?? '')}`;
    default:
      return '';
  }
};

export const QR_PAYLOAD_KINDS: { value: QrPayloadKind; label: string }[] = [
  { value: 'url', label: 'Website' },
  { value: 'text', label: 'Text' },
  { value: 'wifi', label: 'WiFi' },
  { value: 'vcard', label: 'Contact' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
];
