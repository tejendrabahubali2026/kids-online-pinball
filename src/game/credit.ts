/**
 * Developer credit data — single source of truth.
 *
 * The mandatory credit line is:
 *   "Dev- Tejendra Bahubali | Email - tejendrabahubali@outlook.com | Website - https://tejendrabahubali2026.pagezapp.cc.cd/"
 *
 * It is stored as ordered segments so the rendered DOM can make the e-mail and
 * website clickable while `textContent` still reads back as the exact string.
 * Every segment is plain text except the two link targets, and joining the
 * segment text in order reproduces `CREDIT_TEXT` character for character.
 */

export const DEVELOPER_NAME = 'Tejendra Bahubali';
export const DEVELOPER_EMAIL = 'tejendrabahubali@outlook.com';
export const DEVELOPER_WEBSITE = 'https://tejendrabahubali2026.pagezapp.cc.cd/';

export interface CreditSegment {
  /** Literal characters contributed to the credit line. */
  text: string;
  /** When present this segment is rendered as a clickable link. */
  href?: string;
}

export const CREDIT_SEGMENTS: readonly CreditSegment[] = [
  { text: `Dev- ${DEVELOPER_NAME} | Email - ` },
  { text: DEVELOPER_EMAIL, href: `mailto:${DEVELOPER_EMAIL}` },
  { text: ' | Website - ' },
  { text: DEVELOPER_WEBSITE, href: DEVELOPER_WEBSITE },
];

/** The canonical, unformatted credit line. Do not edit. */
export const CREDIT_TEXT = CREDIT_SEGMENTS.map((segment) => segment.text).join('');
