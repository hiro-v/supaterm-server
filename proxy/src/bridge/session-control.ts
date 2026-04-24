const SESSION_CONTROL_PREFIX = '\x1e';

export function isSessionControlMessage(text: string): boolean {
  return text.startsWith(SESSION_CONTROL_PREFIX);
}
