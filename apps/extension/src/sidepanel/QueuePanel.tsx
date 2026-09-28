import type { GarmentCategory } from '@virtual-try-on/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createCaptureDraft } from '../lib/capture';
import { processImage } from '../lib/images';
import { getActiveGenerationBatch } from '../lib/batch-storage';
import type { GenerationBatch } from '../lib/batch-storage';
import { getSettings } from '../lib/settings';
import {
  createCollection,
  deleteCollection,
  listCollections,
  renameCollection,
  setItemCollectionMembership,
} from '../lib/collection-storage';
import type { GarmentCollection } from '../lib/collection-storage';
import { listBodyProfiles } from '../lib/body-profile-storage';
import type { BodyProfile } from '../lib/body-profile-storage';
import { inspectImageReadiness } from '../lib/readiness';
import type { ImageReadiness } from '../lib/readiness';
import {
  commitCaptureDraft,
  deleteCaptureDraft,
  deleteQueueItem,
  findDuplicateQueueItems,
  getLatestCaptureDraft,
  getQueueAssetByKind,
  listQueueItems,
  replaceQueueOrder,
  resetQueueItemForRetry,
  setQueueItemFavorite,
  updateQueueItem,
} from '../lib/queue-storage';
import type { CaptureDraft, QueueItem, QueueStatus } from '../lib/queue-storage';

type QueueFilter = 'all' | QueueStatus;
type CollectionFilter = 'all' | 'favorites' | string;
type BatchReadiness = { id: string; label: string; result: ImageReadiness };

const readinessLabels: Record<ImageReadiness['level'], string> = {
  ready: 'Ready',
  'may-work': 'May work',
  'replace-recommended': 'Replace recommended',
};

function CollectionRow({
  collection,
  onChanged,
}: {
  collection: GarmentCollection;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(collection.name);
  const [error, setError] = useState('');

  return (
    <li>
      {editing ? (
        <input
          aria-label={`Rename ${collection.name}`}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      ) : (
        <span>{collection.name}</span>
      )}
      {editing ? (
        <>
          <button
            onClick={async () => {
              try {
                await renameCollection(collection.id, name);
                setEditing(false);
                setError('');
                onChanged();
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'Could not rename collection.');
              }
            }}
          >
            Save name
          </button>
          <button onClick={() => setEditing(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button onClick={() => setEditing(true)}>Rename</button>
          <button
            className="danger"
            onClick={async () => {
              if (
                !window.confirm(`Delete the ${collection.name} collection? Garments stay saved.`)
              ) {
                return;
              }
              await deleteCollection(collection.id);
              onChanged();
            }}
          >
            Delete
          </button>
        </>
      )}
      {error && <small role="alert">{error}</small>}
    </li>
  );
}

function CollectionManager({
  collections,
  onChanged,
}: {
  collections: GarmentCollection[];
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  return (
    <details className="collection-manager">
      <summary>Manage collections</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await createCollection(name);
            setName('');
            setError('');
            onChanged();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not create collection.');
          }
        }}
      >
        <label>
          New collection
          <input
            value={name}
            maxLength={80}
            placeholder="Work, Wedding, Vacation…"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="button secondary no-margin" disabled={!name.trim()}>
          Create
        </button>
      </form>
      {error && <p className="status error">{error}</p>}
      {collections.length === 0 ? (
        <p className="muted">Create a collection to organize saved garments.</p>
      ) : (
        <ul>
          {collections.map((collection) => (
            <CollectionRow key={collection.id} collection={collection} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </details>
  );
}

function useAssetPreview(itemId: string): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void getQueueAssetByKind(itemId, 'garment').then((asset) => {
      if (!active || !asset) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId]);
  return url;
}

function DraftPreview({ draft }: { draft: CaptureDraft }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(draft.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [draft]);
  return url ? <img src={url} alt="Garment awaiting review" /> : null;
}

function suggestionLabel(draft: CaptureDraft, field: 'productName' | 'displayedPrice' | 'color') {
  const suggestion = draft.metadata?.[field];
  if (!suggestion) return 'Entered locally; review before saving.';
  const source = suggestion.source.replace('-', ' ');
  return `Suggested from ${source} (${suggestion.confidence} confidence).`;
}

function DraftReview({ draft, onSaved }: { draft: CaptureDraft; onSaved: () => void }) {
  const [productName, setProductName] = useState(draft.productName);
  const [store, setStore] = useState(draft.store);
  const [displayedPrice, setDisplayedPrice] = useState(draft.displayedPrice ?? '');
  const [color, setColor] = useState(draft.color ?? '');
  const [category, setCategory] = useState<GarmentCategory | ''>(draft.category ?? '');
  const [duplicate, setDuplicate] = useState<QueueItem>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const commit = async (duplicateOverrideOf?: string) => {
    if (!productName.trim() || !store.trim() || !category) return;
    setSaving(true);
    setError('');
    try {
      await commitCaptureDraft({
        draftId: draft.id,
        productName: productName.trim(),
        store: store.trim(),
        displayedPrice: displayedPrice.trim() || undefined,
        color: color.trim() || undefined,
        category,
        duplicateOverrideOf,
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this garment.');
    } finally {
      setSaving(false);
    }
  };

  const reviewDuplicates = async () => {
    const candidates = await findDuplicateQueueItems(draft.duplicateKey);
    if (candidates.length > 0) {
      setDuplicate(candidates[0]);
      return;
    }
    await commit();
  };

  return (
    <section className="card draft-review" aria-labelledby="draft-review-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Review before saving</p>
          <h2 id="draft-review-title">Confirm garment details</h2>
        </div>
        <DraftPreview draft={draft} />
      </div>
      {draft.metadata?.warnings.map((warning) => (
        <p className="notice" key={warning}>
          {warning}
        </p>
      ))}
      <label className="field compact-field">
        Product name
        <input
          aria-label="Product name"
          value={productName}
          onChange={(event) => setProductName(event.target.value)}
        />
        <small>{suggestionLabel(draft, 'productName')}</small>
      </label>
      <label className="field compact-field">
        Store
        <input
          aria-label="Store"
          value={store}
          onChange={(event) => setStore(event.target.value)}
        />
        <small>
          {draft.metadata?.store
            ? `Suggested from ${draft.metadata.store.source} (${draft.metadata.store.confidence} confidence).`
            : 'Derived from the source page or marked as a manual upload.'}
        </small>
      </label>
      <div className="field-pair">
        <label className="field compact-field">
          Price
          <input
            aria-label="Price"
            value={displayedPrice}
            placeholder="Optional"
            onChange={(event) => setDisplayedPrice(event.target.value)}
          />
          <small>{suggestionLabel(draft, 'displayedPrice')}</small>
        </label>
        <label className="field compact-field">
          Color / variant
          <input
            aria-label="Color or variant"
            value={color}
            placeholder="Optional"
            onChange={(event) => setColor(event.target.value)}
          />
          <small>{suggestionLabel(draft, 'color')}</small>
        </label>
      </div>
      <label className="field compact-field">
        Garment category
        <select
          aria-label="Garment category"
          value={category}
          onChange={(event) => setCategory(event.target.value as GarmentCategory | '')}
        >
          <option value="">Choose a category</option>
          <option value="dress">Dress / one-piece</option>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
        <small>Required for generation; this is never guessed.</small>
      </label>
      {duplicate && (
        <div className="duplicate-warning" role="alert">
          <strong>This garment may already be in your queue.</strong>
          <span>{duplicate.productName}</span>
          <button className="button secondary" onClick={() => void commit(duplicate.id)}>
            Add as a different variant
          </button>
          <button className="link" onClick={() => setDuplicate(undefined)}>
            Keep reviewing
          </button>
        </div>
      )}
      {error && <p className="status error">{error}</p>}
      {!duplicate && (
        <div className="button-row">
          <button
            className="button primary"
            disabled={saving || !productName.trim() || !store.trim() || !category}
            onClick={() => void reviewDuplicates()}
          >
            {saving ? 'Saving…' : 'Add to queue'}
          </button>
          <button
            className="button secondary no-margin"
            onClick={async () => {
              await deleteCaptureDraft(draft.id);
              onSaved();
            }}
          >
            Discard
          </button>
        </div>
      )}
    </section>
  );
}

function QueueCard({
  item,
  selected,
  position,
  count,
  onChanged,
  onSelect,
  onMove,
  selectionLimitReached,
  selectionLocked,
  collections,
}: {
  item: QueueItem;
  selected: boolean;
  position: number;
  count: number;
  onChanged: () => void;
  onSelect: (selected: boolean) => void;
  onMove: (delta: number) => void;
  selectionLimitReached: boolean;
  selectionLocked: boolean;
  collections: GarmentCollection[];
}) {
  const imageUrl = useAssetPreview(item.id);
  const [editing, setEditing] = useState(false);
  const [organizing, setOrganizing] = useState(false);
  const [draft, setDraft] = useState(item);

  useEffect(() => setDraft(item), [item]);

  const saveEdits = async () => {
    await updateQueueItem(item.id, (current) => ({
      ...current,
      productName: draft.productName.trim() || current.productName,
      store: draft.store.trim() || current.store,
      displayedPrice: draft.displayedPrice?.trim() || undefined,
      color: draft.color?.trim() || undefined,
      category: draft.category,
      status: current.status === 'saved' && draft.category ? 'ready' : current.status,
    }));
    setEditing(false);
    onChanged();
  };

  return (
    <article className="queue-card">
      <div className="queue-card-main">
        <label className="queue-select">
          <input
            type="checkbox"
            checked={selected}
            disabled={
              selectionLocked ||
              !['ready', 'failed'].includes(item.status) ||
              (!selected && selectionLimitReached)
            }
            onChange={(event) => onSelect(event.target.checked)}
            aria-label={`Select ${item.productName} for generation`}
          />
        </label>
        <div className="queue-thumb">
          {imageUrl && <img src={imageUrl} alt={`${item.productName} garment`} />}
        </div>
        <div className="queue-copy">
          <div className="queue-title-row">
            <strong>{item.productName}</strong>
            <button
              className="favorite-button"
              aria-label={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={item.favorite}
              onClick={async () => {
                await setQueueItemFavorite(item.id, !item.favorite);
                onChanged();
              }}
            >
              {item.favorite ? '★' : '☆'}
            </button>
          </div>
          <span>{item.store}</span>
          <span>
            {[item.displayedPrice, item.color].filter(Boolean).join(' · ') || 'Details pending'}
          </span>
          <span className={`status-badge status-${item.status}`}>{item.status}</span>
          {item.status === 'completed' && item.job.provider && (
            <span className={item.job.provider === 'mock' ? 'provider-demo' : 'provider-real'}>
              {item.job.provider === 'mock' ? 'Demo · not AI' : 'FASHN result'}
            </span>
          )}
          {item.job.lastError && <span className="queue-error">{item.job.lastError.message}</span>}
        </div>
      </div>
      {editing && (
        <div className="queue-edit">
          <label>
            Name
            <input
              value={draft.productName}
              onChange={(event) => setDraft({ ...draft, productName: event.target.value })}
            />
          </label>
          <label>
            Store
            <input
              value={draft.store}
              onChange={(event) => setDraft({ ...draft, store: event.target.value })}
            />
          </label>
          <label>
            Price
            <input
              value={draft.displayedPrice ?? ''}
              onChange={(event) => setDraft({ ...draft, displayedPrice: event.target.value })}
            />
          </label>
          <label>
            Color
            <input
              value={draft.color ?? ''}
              onChange={(event) => setDraft({ ...draft, color: event.target.value })}
            />
          </label>
          <label>
            Category
            <select
              value={draft.category ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  category: (event.target.value || null) as GarmentCategory | null,
                })
              }
            >
              <option value="">Not set</option>
              <option value="dress">Dress</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
          <div className="button-row">
            <button className="button primary" onClick={() => void saveEdits()}>
              Save
            </button>
            <button className="button secondary no-margin" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {organizing && (
        <fieldset className="queue-collections">
          <legend>Collections for {item.productName}</legend>
          {collections.length === 0 ? (
            <span>Create a collection above first.</span>
          ) : (
            collections.map((collection) => (
              <label key={collection.id}>
                <input
                  type="checkbox"
                  checked={item.collectionIds.includes(collection.id)}
                  onChange={async (event) => {
                    await setItemCollectionMembership(item.id, collection.id, event.target.checked);
                    onChanged();
                  }}
                />
                {collection.name}
              </label>
            ))
          )}
        </fieldset>
      )}
      <div className="queue-actions" aria-label={`Actions for ${item.productName}`}>
        {item.sourceUrl && (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            Open store
          </a>
        )}
        <button onClick={() => setEditing((value) => !value)}>Edit</button>
        <button onClick={() => setOrganizing((value) => !value)}>Collections</button>
        {item.status === 'failed' && (
          <button
            onClick={async () => {
              await resetQueueItemForRetry(item.id);
              onChanged();
            }}
          >
            Retry
          </button>
        )}
        <button disabled={position === 0} onClick={() => onMove(-1)} aria-label="Move up">
          ↑
        </button>
        <button disabled={position === count - 1} onClick={() => onMove(1)} aria-label="Move down">
          ↓
        </button>
        <button
          className="danger"
          onClick={async () => {
            if (!window.confirm(`Remove ${item.productName} from the queue?`)) return;
            await deleteQueueItem(item.id);
            onChanged();
          }}
        >
          Remove
        </button>
      </div>
    </article>
  );
}

export function QueuePanel({
  refreshKey = 0,
  onSelectFromPage,
}: {
  refreshKey?: number;
  onSelectFromPage?: () => Promise<string | undefined>;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [collections, setCollections] = useState<GarmentCollection[]>([]);
  const [profiles, setProfiles] = useState<BodyProfile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [draft, setDraft] = useState<CaptureDraft>();
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [activeBatch, setActiveBatch] = useState<GenerationBatch>();
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [startingBatch, setStartingBatch] = useState(false);
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const [readiness, setReadiness] = useState<BatchReadiness[]>([]);
  const [readinessOverride, setReadinessOverride] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextItems, nextDraft, nextBatch, nextCollections, nextProfiles] = await Promise.all([
        listQueueItems(),
        getLatestCaptureDraft(),
        getActiveGenerationBatch(),
        listCollections(),
        listBodyProfiles(),
      ]);
      setItems(nextItems);
      setCollections(nextCollections);
      setProfiles(nextProfiles);
      setProfileId((current) => {
        if (nextProfiles.some((profile) => profile.id === current)) return current;
        return nextProfiles.find((profile) => profile.isDefault)?.id ?? nextProfiles[0]?.id ?? '';
      });
      setDraft(nextDraft);
      setActiveBatch(nextBatch);
      setSelected((current) => {
        const available = new Set(nextItems.map((item) => item.id));
        return new Set([...current].filter((id) => available.has(id)));
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open your queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load, refreshKey]);

  useEffect(() => {
    if (
      collectionFilter !== 'all' &&
      collectionFilter !== 'favorites' &&
      !collections.some((collection) => collection.id === collectionFilter)
    ) {
      setCollectionFilter('all');
    }
  }, [collectionFilter, collections]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    const listener = (raw: unknown) => {
      if (
        raw &&
        typeof raw === 'object' &&
        'type' in raw &&
        (raw as { type?: string }).type === 'BATCH_UPDATED'
      ) {
        void load();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [load]);

  const visible = useMemo(() => {
    const byStatus = filter === 'all' ? items : items.filter((item) => item.status === filter);
    if (collectionFilter === 'all') return byStatus;
    if (collectionFilter === 'favorites') return byStatus.filter((item) => item.favorite);
    return byStatus.filter((item) => item.collectionIds.includes(collectionFilter));
  }, [collectionFilter, filter, items]);

  const move = async (id: string, delta: number) => {
    const currentIndex = items.findIndex((item) => item.id === id);
    const targetIndex = currentIndex + delta;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    const ids = items.map((item) => item.id);
    [ids[currentIndex], ids[targetIndex]] = [ids[targetIndex]!, ids[currentIndex]!];
    await replaceQueueOrder(ids);
    await load();
  };

  const startBatch = async () => {
    setStartingBatch(true);
    setBatchError('');
    try {
      if (!profileId) throw new Error('Create or choose a body profile before generating.');
      const profile = profiles.find((candidate) => candidate.id === profileId);
      if (!profile?.consent) {
        throw new Error('Allow generation for the selected body profile before continuing.');
      }
      const settings = await getSettings();
      const origin = new URL(settings.apiUrl).origin;
      const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) throw new Error('Backend access was not granted.');
      const response = (await chrome.runtime.sendMessage({
        type: 'START_BATCH',
        itemIds: [...selected],
        profileId,
      })) as { ok?: boolean; error?: string };
      if (!response?.ok) throw new Error(response?.error ?? 'Could not start this batch.');
      setSelected(new Set());
      setConfirmBatch(false);
      await load();
    } catch (reason) {
      setBatchError(reason instanceof Error ? reason.message : 'Could not start this batch.');
    } finally {
      setStartingBatch(false);
    }
  };

  const reviewBatchReadiness = async () => {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      setBatchError('Create or choose a body profile before generating.');
      return;
    }
    setCheckingReadiness(true);
    setBatchError('');
    try {
      const personResult = await inspectImageReadiness({
        role: 'person',
        blob: profile.blob,
        mime: profile.mime,
        size: profile.blob.size,
        width: profile.width,
        height: profile.height,
      });
      const garmentResults = await Promise.all(
        [...selected].map(async (itemId) => {
          const item = items.find((candidate) => candidate.id === itemId);
          const asset = await getQueueAssetByKind(itemId, 'garment');
          const result = asset
            ? await inspectImageReadiness({
                role: 'garment',
                blob: asset.blob,
                mime: asset.mime,
                size: asset.blob.size,
                width: asset.width,
                height: asset.height,
              })
            : {
                level: 'replace-recommended' as const,
                canContinue: false,
                checks: [
                  {
                    code: 'missing-garment',
                    severity: 'error' as const,
                    message: 'The garment image is missing and cannot be submitted.',
                    blocking: true,
                  },
                ],
              };
          return { id: itemId, label: item?.productName ?? 'Garment', result };
        }),
      );
      setReadiness([
        { id: profile.id, label: profile.profileName, result: personResult },
        ...garmentResults,
      ]);
      setReadinessOverride(false);
      setConfirmBatch(true);
    } catch (reason) {
      setBatchError(reason instanceof Error ? reason.message : 'Could not check these images.');
    } finally {
      setCheckingReadiness(false);
    }
  };

  const readinessBlocked = readiness.some((entry) => !entry.result.canContinue);
  const readinessNeedsOverride = readiness.some(
    (entry) => entry.result.level === 'replace-recommended' && entry.result.canContinue,
  );

  return (
    <div className="queue-panel">
      {draft && <DraftReview key={draft.id} draft={draft} onSaved={() => void load()} />}
      <section className="card queue-section" aria-labelledby="queue-title">
        <div className="section-heading queue-heading">
          <div>
            <p className="eyebrow">Across every store</p>
            <h2 id="queue-title">Try-On Queue</h2>
          </div>
          <span className="queue-count">{items.length}</span>
        </div>
        <p className="muted queue-intro">
          Save garments while you shop, then generate and compare them with the same body photo.
        </p>
        <div className="queue-add-actions">
          <button
            className="button primary"
            onClick={() =>
              void onSelectFromPage?.().then((reason) => setCaptureError(reason ?? ''))
            }
            disabled={!onSelectFromPage}
          >
            Pick from this page
          </button>
          <label className="button secondary no-margin queue-upload-button">
            Upload screenshot
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload garment screenshot to queue"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setCaptureError('');
                try {
                  const image = await processImage(file, 'garment', file.name);
                  await createCaptureDraft({ image });
                  await load();
                } catch (reason) {
                  setCaptureError(
                    reason instanceof Error ? reason.message : 'Could not use that screenshot.',
                  );
                } finally {
                  event.target.value = '';
                }
              }}
            />
          </label>
        </div>
        {captureError && (
          <p className="status error" role="alert">
            {captureError}
          </p>
        )}
        <CollectionManager collections={collections} onChanged={() => void load()} />
        <div className="queue-filter-row">
          <label className="queue-filter">
            Status
            <select
              aria-label="Filter by status"
              value={filter}
              onChange={(event) => setFilter(event.target.value as QueueFilter)}
            >
              <option value="all">All statuses</option>
              <option value="saved">Saved</option>
              <option value="ready">Ready</option>
              <option value="generating">Generating</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="queue-filter">
            Collection
            <select
              aria-label="Filter by collection"
              value={collectionFilter}
              onChange={(event) => setCollectionFilter(event.target.value)}
            >
              <option value="all">All collections</option>
              <option value="favorites">Favorites</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {activeBatch && (
          <div className="batch-progress" role="status" aria-live="polite">
            <strong>
              Generating {activeBatch.completedItemIds.length + activeBatch.failedItemIds.length} of{' '}
              {activeBatch.itemIds.length}
            </strong>
            <span>Jobs run one at a time and continue if this panel closes.</span>
          </div>
        )}
        {selected.size > 0 && !activeBatch && (
          <div className="selection-bar" role="status">
            <div>
              <strong>{selected.size} selected</strong>
              <span>{selected.size >= 5 ? 'Batch limit reached.' : 'Select up to 5.'}</span>
            </div>
            <button
              className="button primary"
              disabled={checkingReadiness}
              onClick={() => void reviewBatchReadiness()}
            >
              {checkingReadiness ? 'Checking…' : `Generate ${selected.size}`}
            </button>
          </div>
        )}
        {selected.size > 0 && !activeBatch && (
          <label className="queue-filter batch-profile-picker">
            Body profile
            <select
              disabled={checkingReadiness}
              value={profileId}
              onChange={(event) => {
                setProfileId(event.target.value);
                setReadiness([]);
                setConfirmBatch(false);
              }}
            >
              {profiles.length === 0 ? (
                <option value="">Create a profile first</option>
              ) : (
                profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.profileName}
                    {profile.isDefault ? ' (default)' : ''}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
        {confirmBatch && (
          <div className="batch-confirm" role="dialog" aria-labelledby="batch-confirm-title">
            <h3 id="batch-confirm-title">
              Start {selected.size} {selected.size === 1 ? 'generation' : 'generations'}?
            </h3>
            <p>
              This will request {selected.size} provider{' '}
              {selected.size === 1 ? 'credit' : 'credits'}. Jobs run sequentially using your saved
              body photo.
            </p>
            <div className="readiness-list">
              {readiness.map((entry) => (
                <article key={entry.id} className={`readiness readiness-${entry.result.level}`}>
                  <div>
                    <strong>{entry.label}</strong>
                    <span>{readinessLabels[entry.result.level]}</span>
                  </div>
                  <ul>
                    {entry.result.checks.map((candidate) => (
                      <li key={candidate.code}>{candidate.message}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            {readinessNeedsOverride && !readinessBlocked && (
              <label className="readiness-override">
                <input
                  type="checkbox"
                  checked={readinessOverride}
                  onChange={(event) => setReadinessOverride(event.target.checked)}
                />
                Continue despite the replacement recommendations
              </label>
            )}
            {readinessBlocked && (
              <p className="status error">
                Replace the blocked image before using a provider credit.
              </p>
            )}
            <div className="button-row">
              <button
                className="button primary"
                disabled={
                  startingBatch ||
                  readinessBlocked ||
                  (readinessNeedsOverride && !readinessOverride)
                }
                onClick={() => void startBatch()}
              >
                {startingBatch ? 'Starting…' : `Confirm ${selected.size}`}
              </button>
              <button
                className="button secondary no-margin"
                disabled={startingBatch}
                onClick={() => setConfirmBatch(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {batchError && (
          <p className="status error" role="alert">
            {batchError}
          </p>
        )}
        {loading ? (
          <p role="status">Loading your queue…</p>
        ) : error ? (
          <div className="status error" role="alert">
            {error}
            <button className="link" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="queue-empty">
            <strong>Your queue is empty</strong>
            <span>Select a garment on a shopping page or upload a screenshot to start.</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="queue-empty">
            <strong>No items match this filter</strong>
            <button
              className="link"
              onClick={() => {
                setFilter('all');
                setCollectionFilter('all');
              }}
            >
              Show all items
            </button>
          </div>
        ) : (
          <div className="queue-list">
            {visible.map((item) => {
              const position = items.findIndex((candidate) => candidate.id === item.id);
              return (
                <QueueCard
                  key={item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  position={position}
                  count={items.length}
                  onChanged={() => void load()}
                  onSelect={(checked) => {
                    setReadiness([]);
                    setConfirmBatch(false);
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                  onMove={(delta) => void move(item.id, delta)}
                  selectionLimitReached={selected.size >= 5}
                  selectionLocked={checkingReadiness}
                  collections={collections}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
