import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getComparisonState,
  rankComparisonItems,
  setComparisonItemNotes,
  setComparisonSelection,
} from '../lib/comparison-storage';
import { getQueueAssetByKind, listQueueItems, setQueueItemFavorite } from '../lib/queue-storage';
import type { QueueAsset, QueueItem } from '../lib/queue-storage';

function useAssetUrl(itemId: string, kind: 'garment' | 'result') {
  const [asset, setAsset] = useState<QueueAsset>();
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void getQueueAssetByKind(itemId, kind).then((next) => {
      if (!active || !next) return;
      objectUrl = URL.createObjectURL(next.blob);
      setAsset(next);
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId, kind]);
  return { asset, url };
}

function ComparisonCard({
  item,
  position,
  count,
  onChanged,
  onMove,
  onRemove,
  onWinner,
}: {
  item: QueueItem;
  position: number;
  count: number;
  onChanged: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onWinner: () => void;
}) {
  const result = useAssetUrl(item.id, 'result');
  const garment = useAssetUrl(item.id, 'garment');
  const [notes, setNotes] = useState(item.notes);
  useEffect(() => setNotes(item.notes), [item.notes]);

  return (
    <article className={`comparison-card ${item.winner ? 'winner' : ''}`}>
      <div className="comparison-card-heading">
        <span className="comparison-rank">#{position + 1}</span>
        {item.winner && <span className="winner-badge">Winner</span>}
        {item.job.isDemo ||
        item.job.provider === 'mock' ||
        result.asset?.name.includes('demo') ||
        result.asset?.mime.includes('svg') ? (
          <span className="demo-badge">Simulated · Demo</span>
        ) : (
          <span className="provider-real">FASHN result</span>
        )}
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
      {result.url && (
        <img
          className="comparison-result"
          src={result.url}
          alt={`${item.productName} try-on result`}
        />
      )}
      <div className="comparison-product">
        {garment.url && <img src={garment.url} alt={`${item.productName} garment`} />}
        <div>
          <strong>{item.productName}</strong>
          <span>{item.store}</span>
          <span>
            {[item.displayedPrice, item.color].filter(Boolean).join(' · ') || 'Details pending'}
          </span>
        </div>
      </div>
      <label className="comparison-notes">
        Personal notes
        <textarea
          value={notes}
          maxLength={2000}
          placeholder="What do you like or dislike?"
          onChange={(event) => setNotes(event.target.value)}
          onBlur={async () => {
            await setComparisonItemNotes(item.id, notes);
            onChanged();
          }}
        />
      </label>
      <div className="comparison-card-actions">
        <button disabled={position === 0} onClick={() => onMove(-1)} aria-label="Rank higher">
          ← Higher
        </button>
        <button disabled={position === count - 1} onClick={() => onMove(1)} aria-label="Rank lower">
          Lower →
        </button>
        <button onClick={onWinner}>Choose winner</button>
      </div>
      <div className="comparison-links">
        {item.sourceUrl && (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            Return to store
          </a>
        )}
        {result.url && (
          <a href={result.url} download={result.asset?.name ?? 'try-on-result.png'}>
            Download result
          </a>
        )}
        <button className="danger" onClick={onRemove}>
          Remove from comparison
        </button>
      </div>
    </article>
  );
}

export function ComparisonPanel() {
  const [completed, setCompleted] = useState<QueueItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [items, state] = await Promise.all([listQueueItems(), getComparisonState()]);
      const completedItems = items.filter(
        (item) => item.status === 'completed' && Boolean(item.resultAssetId),
      );
      const available = new Set(completedItems.map((item) => item.id));
      const selected = state.selectedIds.filter((id) => available.has(id)).slice(0, 4);
      setCompleted(completedItems);
      setSelectedIds(selected);
      if (selected.length !== state.selectedIds.length) await setComparisonSelection(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not open comparison.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => void load(true), [load]);

  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => completed.find((item) => item.id === id))
        .filter(Boolean) as QueueItem[],
    [completed, selectedIds],
  );

  const changeSelection = async (next: string[]) => {
    try {
      await setComparisonSelection(next);
      setSelectedIds(next);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update comparison.');
    }
  };

  const move = async (id: string, delta: number) => {
    const index = selectedIds.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    await setComparisonSelection(next);
    await rankComparisonItems(next, selectedItems.find((item) => item.winner)?.id);
    await load();
  };

  const chooseWinner = async (id: string) => {
    await rankComparisonItems(selectedIds, id);
    await load();
  };

  return (
    <section className="card comparison-section" aria-labelledby="comparison-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Cross-store decision</p>
          <h2 id="comparison-title">Compare results</h2>
        </div>
        <span className="queue-count">{selectedIds.length}/4</span>
      </div>
      <p className="muted">Choose two to four completed try-ons, then rank them side by side.</p>
      {loading ? (
        <p role="status">Loading comparison…</p>
      ) : error ? (
        <p className="status error" role="alert">
          {error}
        </p>
      ) : completed.length === 0 ? (
        <div className="queue-empty">
          <strong>No completed try-ons yet</strong>
          <span>Your finished queue results will appear here.</span>
        </div>
      ) : completed.length === 1 ? (
        <div className="comparison-single">
          <p className="notice">
            Complete at least two try-ons to compare side by side. Here is your finished result:
          </p>
          <div className="comparison-scroll" aria-label="Completed try-on result">
            <ComparisonCard
              item={completed[0]!}
              position={0}
              count={1}
              onChanged={() => void load()}
              onMove={() => undefined}
              onRemove={() => undefined}
              onWinner={() => undefined}
            />
          </div>
        </div>
      ) : (
        <>
          <fieldset className="comparison-picker">
            <legend>Select results</legend>
            {completed.map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    aria-label={`Compare ${item.productName} from ${item.store}`}
                    checked={selected}
                    disabled={!selected && selectedIds.length >= 4}
                    onChange={() =>
                      void changeSelection(
                        selected
                          ? selectedIds.filter((id) => id !== item.id)
                          : [...selectedIds, item.id],
                      )
                    }
                  />
                  <span>
                    <strong>{item.productName}</strong>
                    <small>{item.store}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {selectedItems.length < 2 ? (
            <p className="notice">Select at least two results to compare.</p>
          ) : (
            <div className="comparison-scroll" aria-label="Selected try-on comparison">
              {selectedItems.map((item, position) => (
                <ComparisonCard
                  key={item.id}
                  item={item}
                  position={position}
                  count={selectedItems.length}
                  onChanged={() => void load()}
                  onMove={(delta) => void move(item.id, delta)}
                  onRemove={() => void changeSelection(selectedIds.filter((id) => id !== item.id))}
                  onWinner={() => void chooseWinner(item.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
      <p className="disclaimer">
        Visual approximation only. Results do not predict size, fit, measurements, or fabric drape.
      </p>
    </section>
  );
}
