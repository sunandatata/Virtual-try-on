import type { GarmentCategory } from '@virtual-try-on/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createCaptureDraft } from '../lib/capture';
import { processImage } from '../lib/images';
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
}: {
  item: QueueItem;
  selected: boolean;
  position: number;
  count: number;
  onChanged: () => void;
  onSelect: (selected: boolean) => void;
  onMove: (delta: number) => void;
}) {
  const imageUrl = useAssetPreview(item.id);
  const [editing, setEditing] = useState(false);
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
            disabled={!['ready', 'failed'].includes(item.status)}
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
      <div className="queue-actions" aria-label={`Actions for ${item.productName}`}>
        {item.sourceUrl && (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            Open store
          </a>
        )}
        <button onClick={() => setEditing((value) => !value)}>Edit</button>
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
  const [draft, setDraft] = useState<CaptureDraft>();
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [captureError, setCaptureError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextItems, nextDraft] = await Promise.all([listQueueItems(), getLatestCaptureDraft()]);
      setItems(nextItems);
      setDraft(nextDraft);
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

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.status === filter)),
    [filter, items],
  );

  const move = async (id: string, delta: number) => {
    const currentIndex = items.findIndex((item) => item.id === id);
    const targetIndex = currentIndex + delta;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    const ids = items.map((item) => item.id);
    [ids[currentIndex], ids[targetIndex]] = [ids[targetIndex]!, ids[currentIndex]!];
    await replaceQueueOrder(ids);
    await load();
  };

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
        <label className="queue-filter">
          Filter
          <select value={filter} onChange={(event) => setFilter(event.target.value as QueueFilter)}>
            <option value="all">All items</option>
            <option value="saved">Saved</option>
            <option value="ready">Ready</option>
            <option value="generating">Generating</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        {selected.size > 0 && (
          <div className="selection-bar" role="status">
            <strong>{selected.size} selected</strong>
            <span>Batch generation is prepared for the next step.</span>
          </div>
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
            <button className="link" onClick={() => setFilter('all')}>
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
                  onSelect={(checked) =>
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    })
                  }
                  onMove={(delta) => void move(item.id, delta)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
