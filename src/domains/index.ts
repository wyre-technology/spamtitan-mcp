/**
 * Domain handlers index
 *
 * Lazy-loads domain handlers to avoid loading everything upfront.
 */

import type { DomainHandler } from "../utils/types.js";
import type { DomainName } from "../utils/types.js";

// Cache for loaded domain handlers
const domainCache = new Map<DomainName, DomainHandler>();

/**
 * Lazy-load a domain handler
 */
export async function getDomainHandler(
  domain: DomainName
): Promise<DomainHandler> {
  const cached = domainCache.get(domain);
  if (cached) {
    return cached;
  }

  let handler: DomainHandler;

  switch (domain) {
    case "quarantine": {
      const { quarantineHandler } = await import("./quarantine.js");
      handler = quarantineHandler;
      break;
    }
    case "lists": {
      const { listsHandler } = await import("./lists.js");
      handler = listsHandler;
      break;
    }
    case "stats": {
      const { statsHandler } = await import("./stats.js");
      handler = statsHandler;
      break;
    }
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }

  domainCache.set(domain, handler);
  return handler;
}

/**
 * Get all available domain names
 */
export function getAvailableDomains(): DomainName[] {
  return ["quarantine", "lists", "stats"];
}

/**
 * Clear the domain cache (useful for testing)
 */
export function clearDomainCache(): void {
  domainCache.clear();
}
