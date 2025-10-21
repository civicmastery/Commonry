import { ulid } from "ulid";
import {
  NoteId,
  CardId,
  DeckId,
  ReviewId,
  MediaId,
  UserId,
  CardModelId,
  CardTemplateId,
  EntityId,
  EntityType,
  ENTITY_PREFIXES,
  PREFIX_TO_ENTITY,
} from "../types/ids";

/**
 * Generic ID generation
 * @param type - Entity type
 * @returns Prefixed ULID
 */
function generate(type: EntityType): string {
  const prefix = ENTITY_PREFIXES[type];
  const ulidValue = ulid();
  return `${prefix}_${ulidValue}`;
}

/**
 * Decode Base32 string to number
 * @param str - Base32 encoded string
 * @returns Decoded number
 */
function decodeBase32(str: string): number {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let result = 0;

  for (const char of str) {
    const value = alphabet.indexOf(char);
    result = result * 32 + value;
  }

  return result;
}

/**
 * Format age in human-readable format
 * @param ms - Age in milliseconds
 * @returns Formatted age string
 */
function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Service for generating and managing entity IDs
 * Uses prefixed ULIDs for type safety and chronological sorting
 */
export const IdService = {
  // ===== Generation Methods =====

  generateNoteId(): NoteId {
    return generate("note") as NoteId;
  },

  generateCardId(): CardId {
    return generate("card") as CardId;
  },

  generateDeckId(): DeckId {
    return generate("deck") as DeckId;
  },

  generateReviewId(): ReviewId {
    return generate("review") as ReviewId;
  },

  generateMediaId(): MediaId {
    return generate("media") as MediaId;
  },

  generateUserId(): UserId {
    return generate("user") as UserId;
  },

  generateCardModelId(): CardModelId {
    return generate("cardModel") as CardModelId;
  },

  generateCardTemplateId(): CardTemplateId {
    return generate("cardTemplate") as CardTemplateId;
  },

  // ===== Validation Methods =====

  isValidId(id: string): boolean {
    const parts = id.split("_");
    if (parts.length !== 2) return false;

    const [prefix, ulidPart] = parts;

    // Check if prefix is valid
    if (!(prefix in PREFIX_TO_ENTITY)) return false;

    // Check if ULID part is valid (26 characters, Base32)
    const ulidRegex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;
    return ulidRegex.test(ulidPart);
  },

  isNoteId(id: string): id is NoteId {
    return id.startsWith(`${ENTITY_PREFIXES.note}_`) && this.isValidId(id);
  },

  isCardId(id: string): id is CardId {
    return id.startsWith(`${ENTITY_PREFIXES.card}_`) && this.isValidId(id);
  },

  isDeckId(id: string): id is DeckId {
    return id.startsWith(`${ENTITY_PREFIXES.deck}_`) && this.isValidId(id);
  },

  isReviewId(id: string): id is ReviewId {
    return id.startsWith(`${ENTITY_PREFIXES.review}_`) && this.isValidId(id);
  },

  isMediaId(id: string): id is MediaId {
    return id.startsWith(`${ENTITY_PREFIXES.media}_`) && this.isValidId(id);
  },

  isUserId(id: string): id is UserId {
    return id.startsWith(`${ENTITY_PREFIXES.user}_`) && this.isValidId(id);
  },

  // ===== Parsing Methods =====

  /**
   * Extract entity type from ID
   * @param id - Any entity ID
   * @returns Entity type or null if invalid
   */
  getEntityType(id: string): EntityType | null {
    const prefix = id.split("_")[0];
    return PREFIX_TO_ENTITY[prefix] || null;
  },

  /**
   * Extract ULID portion from ID
   * @param id - Any entity ID
   * @returns ULID string without prefix
   */
  getUlid(id: EntityId): string {
    return id.split("_")[1];
  },

  /**
   * Extract timestamp from ID
   * @param id - Any entity ID
   * @returns Date object representing when ID was created
   */
  getTimestamp(id: EntityId): Date {
    const ulidPart = this.getUlid(id);

    // Decode ULID timestamp (first 10 characters)
    const timestampStr = ulidPart.substring(0, 10);
    const timestamp = decodeBase32(timestampStr);

    return new Date(timestamp);
  },

  // ===== Sync Utilities =====

  /**
   * Create a cursor ID for pagination/sync
   * Useful for getting all entities created after a certain time
   * @param timestamp - Cutoff timestamp
   * @param type - Entity type
   * @returns Cursor ID that can be used in >= comparisons
   */
  createSyncCursor(timestamp: Date, type: EntityType): string {
    const prefix = ENTITY_PREFIXES[type];
    const ulidValue = ulid(timestamp.getTime());
    return `${prefix}_${ulidValue}`;
  },

  /**
   * Compare two IDs chronologically
   * @param id1 - First ID
   * @param id2 - Second ID
   * @returns -1 if id1 < id2, 0 if equal, 1 if id1 > id2
   */
  compare(id1: EntityId, id2: EntityId): number {
    return id1.localeCompare(id2);
  },

  /**
   * Check if ID was created after a given timestamp
   * @param id - Entity ID
   * @param timestamp - Comparison timestamp
   * @returns True if ID was created after timestamp
   */
  isCreatedAfter(id: EntityId, timestamp: Date): boolean {
    const idTimestamp = this.getTimestamp(id);
    return idTimestamp > timestamp;
  },

  // ===== Import/Export Utilities =====

  /**
   * Generate a mapping between external IDs and new internal IDs
   * Used when importing from other systems (Anki, Quizlet, etc.)
   * @param externalIds - Array of external IDs
   * @param type - Entity type to generate
   * @returns Map of external ID -> internal ID
   */
  createImportMapping(
    externalIds: string[],
    type: EntityType,
  ): Map<string, EntityId> {
    const mapping = new Map<string, EntityId>();

    for (const externalId of externalIds) {
      const internalId = generate(type) as EntityId;
      mapping.set(externalId, internalId);
    }

    return mapping;
  },

  /**
   * Parse an ID from a potentially untrusted source
   * @param id - ID string to parse
   * @param expectedType - Expected entity type (optional)
   * @returns Validated ID or null if invalid
   */
  parseId(id: string, expectedType?: EntityType): EntityId | null {
    if (!this.isValidId(id)) {
      return null;
    }

    const actualType = this.getEntityType(id);
    if (expectedType && actualType !== expectedType) {
      return null;
    }

    return id as EntityId;
  },

  // ===== Batch Operations =====

  /**
   * Generate multiple IDs at once
   * @param type - Entity type
   * @param count - Number of IDs to generate
   * @returns Array of generated IDs
   */
  generateBatch(type: EntityType, count: number): EntityId[] {
    const ids: EntityId[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(generate(type) as EntityId);
    }
    return ids;
  },

  // ===== Debugging Utilities =====

  /**
   * Get human-readable info about an ID
   * @param id - Entity ID
   * @returns Debug information
   */
  debug(id: EntityId): {
    valid: boolean;
    type: EntityType | null;
    prefix: string;
    ulid: string;
    timestamp: Date | null;
    age: string | null;
  } {
    const valid = this.isValidId(id);
    const parts = id.split("_");
    const prefix = parts[0];
    const ulidPart = parts[1] || "";
    const type = this.getEntityType(id);

    let timestamp: Date | null = null;
    let age: string | null = null;

    if (valid) {
      timestamp = this.getTimestamp(id);
      const ageMs = Date.now() - timestamp.getTime();
      age = formatAge(ageMs);
    }

    return { valid, type, prefix, ulid: ulidPart, timestamp, age };
  },
} as const;

// Export singleton instance for convenience
export const ids = IdService;
