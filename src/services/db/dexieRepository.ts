import type { IndexedRepository } from './repository';
import type { EntityTable } from 'dexie';

/**
 * IndexedDB-backed implementation of the repository contract.
 *
 * Generic over the entity so every table shares one tested implementation.
 * Table-specific behaviour belongs in the domain or the store, not here — this
 * layer only moves entities in and out of storage.
 *
 * Every table in the schema keys on `id`, stated explicitly rather than left to
 * a library default that could shift between versions.
 */
export class DexieRepository<
  TEntity extends { id: TId },
  TId extends string,
  TIndex extends string,
> implements IndexedRepository<TEntity, TId, TIndex> {
  constructor(private readonly table: () => EntityTable<TEntity, 'id'>) {}

  async getAll(): Promise<TEntity[]> {
    return this.table().toArray();
  }

  async getById(id: TId): Promise<TEntity | undefined> {
    // TEntity is constrained to { id: TId }, so this is the key type by
    // construction. TypeScript cannot prove that while TEntity is still generic,
    // hence the cast — it narrows nothing that the constraint does not already
    // guarantee.
    return this.table().get(id as never);
  }

  async put(entity: TEntity): Promise<void> {
    await this.table().put(entity);
  }

  async putMany(entities: readonly TEntity[]): Promise<void> {
    if (entities.length === 0) return;
    await this.table().bulkPut([...entities]);
  }

  async remove(id: TId): Promise<void> {
    await this.table().delete(id as never);
  }

  async clear(): Promise<void> {
    await this.table().clear();
  }

  /**
   * Queries a declared index. Passing an index that was not declared in the
   * schema throws rather than falling back to a full scan, which would turn a
   * schema mistake into a silent performance problem.
   */
  async getBy(index: TIndex, value: string): Promise<TEntity[]> {
    return this.table().where(index).equals(value).toArray();
  }
}
