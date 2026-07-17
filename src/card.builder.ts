/**
 * Quarantined-message card payload builder for the MCP Apps (SEP-1865) UI
 * surface.
 *
 * spamtitan_get_message results get a normalized `_card` object attached
 * (see domains/quarantine.ts) that the ui:// message card renders from. The
 * card is progressive enhancement: every step here is best-effort, and a null
 * return simply means the host renders no card while the JSON payload is
 * unchanged.
 *
 * The card is READ-ONLY by policy: releasing or deleting a quarantined
 * message stays a deliberate, model-mediated action and is never exposed as
 * an in-card button.
 */

export const MESSAGE_CARD_RESOURCE_URI = "ui://spamtitan/message-card.html";

/** MCP Apps resource MIME (RESOURCE_MIME_TYPE in @modelcontextprotocol/ext-apps). */
export const MCP_APP_RESOURCE_MIME = "text/html;profile=mcp-app";

/**
 * Tool `_meta` advertising the card. Carries both the canonical flat key
 * (RESOURCE_URI_META_KEY in ext-apps) and the nested form ext-apps'
 * registerAppTool emits, so any MCP Apps host revision finds it.
 */
export const MESSAGE_CARD_META = {
  "ui/resourceUri": MESSAGE_CARD_RESOURCE_URI,
  ui: { resourceUri: MESSAGE_CARD_RESOURCE_URI },
} as const;

/** Mirror of Brand in ui/message-card.ts — keep in sync. */
export interface CardBrand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}

/** The BRAND_INJECT comment marker baked into the card HTML (see ui/index.html). */
const BRAND_INJECT_RE = /<!--\s*BRAND_INJECT:[\s\S]*?-->/;

/**
 * Serve-time brand injection: replace the BRAND_INJECT marker with an inline
 * `window.__BRAND__` script so self-hosters can theme the card without
 * rebuilding the bundle. An empty brand returns the HTML unchanged (the card
 * renders its neutral defaults). `<` is escaped so brand values can never
 * break out of the script tag.
 */
export function applyBrandInjection(html: string, brand: CardBrand): string {
  if (!brand || Object.values(brand).every((v) => !v)) return html;
  const json = JSON.stringify(brand).replace(/</g, "\\u003c");
  return html.replace(BRAND_INJECT_RE, `<script>window.__BRAND__=${json}</script>`);
}

/**
 * Resolve brand overrides from MCP_BRAND_* environment variables. Guarded for
 * runtimes without `process`, where this returns an empty brand and the card
 * serves its neutral defaults.
 */
export function resolveBrandFromEnv(): CardBrand {
  if (typeof process === "undefined" || !process.env) return {};
  const env = process.env;
  const brand: CardBrand = {};
  if (env.MCP_BRAND_NAME) brand.name = env.MCP_BRAND_NAME;
  if (env.MCP_BRAND_LOGO_URL) brand.logoUrl = env.MCP_BRAND_LOGO_URL;
  if (env.MCP_BRAND_PRIMARY_COLOR) brand.primaryColor = env.MCP_BRAND_PRIMARY_COLOR;
  if (env.MCP_BRAND_ACCENT_COLOR) brand.accentColor = env.MCP_BRAND_ACCENT_COLOR;
  if (env.MCP_BRAND_BG) brand.bg = env.MCP_BRAND_BG;
  if (env.MCP_BRAND_TEXT) brand.text = env.MCP_BRAND_TEXT;
  return brand;
}

/** Mirror of MessageCard in ui/message-card.ts — keep in sync. */
export interface MessageCard {
  id: string;
  subject?: string;
  sender?: string;
  recipient?: string;
  reason?: string;
  score?: string;
  status?: string;
  date?: string;
}

const CARD_SUBJECT_MAX_LENGTH = 300;

/** Non-empty string, or undefined. */
function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** Non-empty string or finite number, rendered as a string, or undefined. */
function numOrStr(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return str(value);
}

/**
 * Build the renderable card from a spamtitan_get_message payload. SpamTitan
 * returns flat, human-readable fields (sender, recipient, subject, reason —
 * the same vocabulary spamtitan_get_queue filters on), so normalization is
 * picking the right keys, not resolving ids. Returns null when the payload
 * doesn't look like a quarantined message.
 */
export function buildMessageCard(message: Record<string, unknown>): MessageCard | null {
  const id = numOrStr(message?.id) ?? str(message?.message_id);
  if (!id) return null;

  const sender = str(message.sender) ?? str(message.from);
  const recipient = str(message.recipient) ?? str(message.to);
  const subject = str(message.subject);

  // Require at least one human-recognizable email field so arbitrary
  // id-bearing payloads don't render as an empty card.
  if (!sender && !recipient && !subject) return null;

  const card: MessageCard = { id };
  if (subject) card.subject = subject.slice(0, CARD_SUBJECT_MAX_LENGTH);
  if (sender) card.sender = sender;
  if (recipient) card.recipient = recipient;

  const reason = str(message.reason) ?? str(message.type);
  const score = numOrStr(message.score) ?? numOrStr(message.spam_score);
  const status = str(message.status);
  const date = str(message.date) ?? str(message.received) ?? str(message.created_at);
  if (reason) card.reason = reason;
  if (score) card.score = score;
  if (status) card.status = status;
  if (date) card.date = date;

  return card;
}
