import { Linking, Platform } from 'react-native';

/**
 * The off-app bridge. These build the URLs that hand a responder to their own
 * messaging app with context pre-filled, so the best session ends by LEAVING
 * SPER. No message is ever sent from inside the app.
 */

function encode(text: string): string {
  return encodeURIComponent(text);
}

/**
 * True on a desktop/laptop web browser, where whatsapp:/sms:/tel: links
 * don't reliably launch anything. False on native apps and on mobile web
 * browsers, where these links work as expected.
 */
export function isDesktopWeb(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof navigator === 'undefined') return true;
  return !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export async function openWhatsApp(text: string, phone?: string): Promise<boolean> {
  const url = phone
    ? `whatsapp://send?phone=${encode(phone)}&text=${encode(text)}`
    : `whatsapp://send?text=${encode(text)}`;
  return tryOpen(url);
}

export async function openMessage(text: string, phone?: string): Promise<boolean> {
  // iMessage/SMS share the sms: scheme; body param differs slightly by platform.
  const sep = Platform.OS === 'ios' ? '&' : '?';
  const base = phone ? `sms:${phone}` : 'sms:';
  const url = `${base}${sep}body=${encode(text)}`;
  return tryOpen(url);
}

export async function openCall(phone: string): Promise<boolean> {
  return tryOpen(`tel:${phone}`);
}

async function tryOpen(url: string): Promise<boolean> {
  if (isDesktopWeb()) return false;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Suggested pre-fill for reaching out, kept short and warm. */
export function outreachPrefill(friendName: string): string {
  return `Hey ${friendName}, thinking of you — no need to reply, just wanted you to know I’m here.`;
}
