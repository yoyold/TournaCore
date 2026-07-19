/**
 * Storage contract for one entity type.
 *
 * Deliberately minimal and deliberately an interface rather than a concrete
 * class. The local IndexedDB implementation is one of potentially several: a
 * remote backend would be a second implementation behind the same contract, and
 * no store or component would need to change.
 *
 * That is why nothing above this layer imports Dexie, and why the methods speak
 * in domain entities rather than database rows.
 */
export interface Repository<TEntity, TId extends string> {
  getAll(): Promise<TEntity[]>;
  getById(id: TId): Promise<TEntity | undefined>;
  /** Inserts or replaces. */
  put(entity: TEntity): Promise<void>;
  putMany(entities: readonly TEntity[]): Promise<void>;
  remove(id: TId): Promise<void>;
  clear(): Promise<void>;
}

/** Repository that can also query by a foreign key, e.g. all matches of a stage. */
export interface IndexedRepository<
  TEntity,
  TId extends string,
  TIndex extends string,
> extends Repository<TEntity, TId> {
  getBy(index: TIndex, value: string): Promise<TEntity[]>;
}
