// src/services/import-mapping-service.ts
import { db } from "../storage/database";
import type {
  ImportMapping,
  ImportBatch,
  ImportSource,
  EntityType,
} from "../storage/database";
import { IdService } from "./id-service";
import type { CardId, DeckId, NoteId } from "../types/ids";
import { ulid } from "ulid";

export type EntityId = CardId | DeckId | NoteId | string;

export const ImportMappingService = {
  /**
   * Get or create a mapping for a single external ID
   * Returns the internal ID (creates new one if needed)
   */
  async getOrCreateMapping(
    sourceSystem: ImportSource,
    sourceId: string,
    entityType: EntityType,
    importBatchId?: string,
  ): Promise<EntityId> {
    // Check if mapping already exists
    const existing = await db.importMappings
      .where("[sourceSystem+sourceId+entityType]")
      .equals([sourceSystem, sourceId, entityType])
      .first();

    if (existing) {
      // Update the timestamp
      if (existing.id !== undefined) {
        await db.importMappings.update(existing.id, {
          updatedAt: new Date(),
        });
      }
      return existing.internalId as EntityId;
    }

    // Create new internal ID based on entity type
    let internalId: EntityId;
    switch (entityType) {
      case "card":
        internalId = IdService.generateCardId();
        break;
      case "deck":
        internalId = IdService.generateDeckId();
        break;
      case "note":
        internalId = IdService.generateNoteId();
        break;
      case "media":
        internalId = IdService.generateMediaId();
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    // Create mapping
    const mapping: ImportMapping = {
      sourceSystem,
      sourceId,
      internalId,
      entityType,
      importedAt: new Date(),
      updatedAt: new Date(),
      importBatchId,
    };

    await db.importMappings.add(mapping);

    return internalId;
  },

  /**
   * Get or create mappings for multiple external IDs efficiently
   * Returns a Map of sourceId -> internalId
   */
  async getOrCreateMappingsBatch(
    sourceSystem: ImportSource,
    sourceIds: string[],
    entityType: EntityType,
    importBatchId?: string,
  ): Promise<Map<string, EntityId>> {
    const mappings = new Map<string, EntityId>();

    // Get all existing mappings for these source IDs
    const existing = await db.importMappings
      .where("sourceSystem")
      .equals(sourceSystem)
      .and((m) => m.entityType === entityType && sourceIds.includes(m.sourceId))
      .toArray();

    // Add existing mappings to result
    for (const mapping of existing) {
      mappings.set(mapping.sourceId, mapping.internalId as EntityId);
    }

    // Find source IDs that don't have mappings yet
    const newSourceIds = sourceIds.filter((id) => !mappings.has(id));

    // Create new mappings
    const newMappings: ImportMapping[] = [];
    for (const sourceId of newSourceIds) {
      let internalId: EntityId;
      switch (entityType) {
        case "card":
          internalId = IdService.generateCardId();
          break;
        case "deck":
          internalId = IdService.generateDeckId();
          break;
        case "note":
          internalId = IdService.generateNoteId();
          break;
        case "media":
          internalId = IdService.generateMediaId();
          break;
        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      newMappings.push({
        sourceSystem,
        sourceId,
        internalId,
        entityType,
        importedAt: new Date(),
        updatedAt: new Date(),
        importBatchId,
      });

      mappings.set(sourceId, internalId);
    }

    // Bulk insert new mappings
    if (newMappings.length > 0) {
      await db.importMappings.bulkAdd(newMappings);
    }

    return mappings;
  },

  /**
   * Get internal ID for an external ID (lookup only, doesn't create)
   */
  async getInternalId(
    sourceSystem: ImportSource,
    sourceId: string,
    entityType: EntityType,
  ): Promise<EntityId | null> {
    const mapping = await db.importMappings
      .where("[sourceSystem+sourceId+entityType]")
      .equals([sourceSystem, sourceId, entityType])
      .first();

    return mapping ? (mapping.internalId as EntityId) : null;
  },

  /**
   * Get external ID for an internal ID (reverse lookup)
   */
  async getExternalId(
    internalId: string,
    sourceSystem: ImportSource,
  ): Promise<string | null> {
    const mapping = await db.importMappings
      .where("internalId")
      .equals(internalId)
      .and((m) => m.sourceSystem === sourceSystem)
      .first();

    return mapping ? mapping.sourceId : null;
  },

  /**
   * Get all mappings for a specific import batch
   */
  async getMappingsByBatch(importBatchId: string): Promise<ImportMapping[]> {
    return await db.importMappings
      .where("importBatchId")
      .equals(importBatchId)
      .toArray();
  },

  /**
   * Create a new import batch
   */
  async createImportBatch(
    sourceSystem: ImportSource,
    fileName?: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const batch: ImportBatch = {
      id: `batch_${ulid()}`,
      sourceSystem,
      fileName,
      importedAt: new Date(),
      status: "in_progress",
      notesImported: 0,
      cardsImported: 0,
      decksImported: 0,
      metadata,
    };

    await db.importBatches.add(batch);
    return batch.id;
  },

  /**
   * Update import batch status and counts
   */
  async updateImportBatch(
    batchId: string,
    updates: Partial<ImportBatch>,
  ): Promise<void> {
    await db.importBatches.update(batchId, updates);
  },

  /**
   * Mark import batch as completed
   */
  async completeImportBatch(
    batchId: string,
    counts: {
      notesImported: number;
      cardsImported: number;
      decksImported: number;
    },
  ): Promise<void> {
    await db.importBatches.update(batchId, {
      status: "completed",
      ...counts,
    });
  },

  /**
   * Mark import batch as failed
   */
  async failImportBatch(batchId: string): Promise<void> {
    await db.importBatches.update(batchId, {
      status: "failed",
    });
  },

  /**
   * Rollback an import batch (delete all associated entities and mappings)
   */
  async rollbackImportBatch(batchId: string): Promise<void> {
    await db.transaction(
      "rw",
      db.importMappings,
      db.importBatches,
      db.cards,
      db.decks,
      async () => {
        // Get all mappings for this batch
        const mappings = await this.getMappingsByBatch(batchId);

        // Delete cards and decks created in this batch
        for (const mapping of mappings) {
          if (mapping.entityType === "card") {
            await db.cards.delete(mapping.internalId);
          } else if (mapping.entityType === "deck") {
            await db.decks.delete(mapping.internalId);
          }
        }

        // Delete all mappings for this batch
        await db.importMappings.where("importBatchId").equals(batchId).delete();

        // Mark batch as rolled back
        await db.importBatches.update(batchId, {
          status: "rolled_back",
        });
      },
    );
  },

  /**
   * Get import batch by ID
   */
  async getImportBatch(batchId: string): Promise<ImportBatch | undefined> {
    return await db.importBatches.get(batchId);
  },

  /**
   * Get all import batches
   */
  async getAllImportBatches(): Promise<ImportBatch[]> {
    return await db.importBatches.orderBy("importedAt").reverse().toArray();
  },

  /**
   * Check if a deck has been previously imported
   * Returns the import batch ID if found
   */
  async getDeckImportBatch(
    sourceSystem: ImportSource,
    sourceDeckId: string,
  ): Promise<string | null> {
    const mapping = await db.importMappings
      .where("[sourceSystem+sourceId+entityType]")
      .equals([sourceSystem, sourceDeckId, "deck"])
      .first();

    return mapping?.importBatchId || null;
  },

  /**
   * Delete all mappings for a specific source system
   */
  async deleteMappingsBySource(sourceSystem: ImportSource): Promise<void> {
    await db.importMappings.where("sourceSystem").equals(sourceSystem).delete();
  },
} as const;
