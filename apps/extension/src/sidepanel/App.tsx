import {
  apiErrorSchema,
  garmentCategorySchema,
  statusResponseSchema,
  submitResponseSchema,
  extensionMessageSchema,
} from '@virtual-try-on/shared';
import type { GarmentCategory } from '@virtual-try-on/shared';
import { useCallback, useEffect, useState } from 'react';
import { processImage } from '../lib/images';
import { createCaptureDraft } from '../lib/capture';
import { getSettings, saveSettings } from '../lib/settings';
import type { ExtensionSettings } from '../lib/settings';
import { migrateLegacyGarmentToQueue } from '../lib/storage-migrations';
import { deleteImage, getImage, saveImage } from '../lib/storage';
import type { ImageSlot, StoredImage } from '../lib/storage';
import { QueuePanel } from './QueuePanel';
import { canGenerate, idleGeneration } from './state';
import type { GenerationState } from './state';

const ACCEPT = 'image/jpeg,image/png,image/webp';

function usePreview(image?: StoredImage) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!image) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(image.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [image]);
  return url;
}

function ImageUpload({
  label,
  slot,
  image,
  onImage,
}: {
  label: string;
  slot: ImageSlot;
  image?: StoredImage;
  onImage: (image?: StoredImage) => void;
}) {
  const preview = usePreview(image);
  const [error, setError] = useState('');
  const accept = async (file?: File) => {
    if (!file) return;
    try {
      setError('');
      const processed = await processImage(file, slot, file.name);
      await saveImage(processed);
      onImage(processed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not use that image.');
    }
  };
  return (
    <div className="upload-wrap">
      <label
        className="drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void accept(event.dataTransfer.files[0]);
        }}
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} />
        ) : (
          <span>
            <strong>{label}</strong>
            <small>Drop an image here or choose a file</small>
          </span>
        )}
        <input
          type="file"
          accept={ACCEPT}
          aria-label={label}
          onChange={(event) => void accept(event.target.files?.[0])}
        />
      </label>
      {image && (
        <button
          className="link danger"
          onClick={async () => {
            await deleteImage(slot);
            onImage(undefined);
          }}
        >
          Remove {slot === 'person' ? 'photo' : 'garment'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function App() {
  const [person, setPerson] = useState<StoredImage>();
  const [garment, setGarment] = useState<StoredImage>();
  const [result, setResult] = useState<StoredImage>();
  const [settings, setSettings] = useState<ExtensionSettings>();
  const [category, setCategory] = useState<GarmentCategory>('dress');
  const [generation, setGeneration] = useState<GenerationState>(idleGeneration);
  const [notice, setNotice] = useState('');
  const [activeView, setActiveView] = useState<'queue' | 'try-on'>('queue');
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const personUrl = usePreview(person);
  const garmentUrl = usePreview(garment);
  const resultUrl = usePreview(result);

  const persistGeneration = useCallback(async (next: GenerationState) => {
    setGeneration(next);
    await chrome.storage.local.set({ generation: next });
  }, []);

  const storeResult = useCallback(
    async (source: string, isDemo: boolean, apiUrl: string, accessCode: string) => {
      const url = source.startsWith('/') ? `${apiUrl}${source}` : source;
      const response = source.startsWith('data:')
        ? await fetch(source)
        : await fetch(url, { headers: accessCode ? { 'X-Access-Code': accessCode } : {} });
      if (!response.ok) throw new Error('The result could not be downloaded securely.');
      const blob = await response.blob();
      const stored: StoredImage = {
        slot: 'result',
        blob,
        name: isDemo ? 'virtual-try-on-demo.svg' : 'virtual-try-on-result.png',
        mime: blob.type,
        width: 0,
        height: 0,
        updatedAt: Date.now(),
      };
      await saveImage(stored);
      setResult(stored);
    },
    [],
  );

  const poll = useCallback(
    async (jobToken: string, currentSettings: ExtensionSettings) => {
      try {
        const response = await fetch(
          `${currentSettings.apiUrl}/api/try-on/status?token=${encodeURIComponent(jobToken)}`,
          {
            headers: currentSettings.accessCode
              ? { 'X-Access-Code': currentSettings.accessCode }
              : {},
          },
        );
        const body: unknown = await response.json();
        const parsed = statusResponseSchema.safeParse(body);
        if (!parsed.success) {
          const apiError = apiErrorSchema.safeParse(body);
          throw new Error(
            apiError.success ? apiError.data.error.message : 'Unexpected status response.',
          );
        }
        if (parsed.data.status === 'processing') {
          await persistGeneration({
            status: 'processing',
            message: 'Creating your preview. This can take a little while…',
            jobToken,
          });
          window.setTimeout(() => void poll(jobToken, currentSettings), 900);
          return;
        }
        if (parsed.data.status === 'failed') {
          await persistGeneration({
            status: 'failed',
            message: parsed.data.error ?? 'Generation failed.',
          });
          return;
        }
        if (!parsed.data.resultUrl) throw new Error('The service returned no result image.');
        await storeResult(
          parsed.data.resultUrl,
          parsed.data.isDemo === true,
          currentSettings.apiUrl,
          currentSettings.accessCode,
        );
        await persistGeneration({
          status: 'succeeded',
          message: parsed.data.isDemo ? 'Demo result ready.' : 'Your preview is ready.',
          isDemo: parsed.data.isDemo,
        });
      } catch (error) {
        await persistGeneration({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Could not check this generation.',
        });
      }
    },
    [persistGeneration, storeResult],
  );

  useEffect(() => {
    void (async () => {
      await migrateLegacyGarmentToQueue();
      const [savedPerson, savedGarment, savedResult, savedSettings, local] = await Promise.all([
        getImage('person'),
        getImage('garment'),
        getImage('result'),
        getSettings(),
        chrome.storage.local.get(['generation', 'garmentSelectionError']),
      ]);
      setPerson(savedPerson);
      setGarment(savedGarment);
      setResult(savedResult);
      setSettings(savedSettings);
      if (local.garmentSelectionError) setNotice(String(local.garmentSelectionError));
      const restored = local.generation as GenerationState | undefined;
      if (restored) setGeneration(restored);
      if (restored?.status === 'processing' && restored.jobToken) {
        void poll(restored.jobToken, savedSettings);
      }
    })();
    const listener = (raw: unknown) => {
      const parsed = extensionMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      if (parsed.data.type === 'GARMENT_BYTES') {
        void getImage('garment').then((next) => {
          setGarment(next);
          setActiveView('queue');
          setQueueRefreshKey((value) => value + 1);
          setNotice(
            next ? 'Garment selected from the page.' : 'Could not read the selected garment.',
          );
        });
      }
      if (parsed.data.type === 'GARMENT_FETCH_FAILED') {
        setNotice(`${parsed.data.reason} Upload a screenshot below.`);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [poll]);

  if (!settings)
    return (
      <main className="shell">
        <p role="status">Opening your wardrobe…</p>
      </main>
    );

  const updateConsent = async (consent: boolean) => {
    const next = { ...settings, consent };
    setSettings(next);
    await saveSettings(next);
  };

  const removePerson = async () => {
    await deleteImage('person');
    setPerson(undefined);
    await updateConsent(false);
    await persistGeneration(idleGeneration);
  };

  const selectFromPage = async () => {
    setNotice('');
    const response = (await chrome.runtime.sendMessage({ type: 'OPEN_PICKER' })) as {
      ok: boolean;
      error?: string;
    };
    if (!response?.ok) {
      const reason = response?.error ?? 'Could not start garment selection.';
      setNotice(reason);
      return reason;
    }
    setNotice('Selection mode is active on the shopping page.');
    return undefined;
  };

  const generate = async () => {
    if (!person || !garment) return;
    try {
      await persistGeneration({ status: 'submitting', message: 'Sending your images securely…' });
      const origin = new URL(settings.apiUrl).origin;
      const permission = await chrome.permissions.request({ origins: [`${origin}/*`] });
      if (!permission) throw new Error('Backend access was not granted. You can retry when ready.');
      const form = new FormData();
      form.set('person', person.blob, person.name);
      form.set('garment', garment.blob, garment.name);
      form.set('category', garmentCategorySchema.parse(category));
      const response = await fetch(`${origin}/api/try-on`, {
        method: 'POST',
        headers: settings.accessCode ? { 'X-Access-Code': settings.accessCode } : {},
        body: form,
      });
      const body: unknown = await response.json();
      const parsed = submitResponseSchema.safeParse(body);
      if (!parsed.success) {
        const apiError = apiErrorSchema.safeParse(body);
        throw new Error(
          apiError.success ? apiError.data.error.message : 'Unexpected service response.',
        );
      }
      await persistGeneration({
        status: 'processing',
        message: 'The service is preparing your preview…',
        jobToken: parsed.data.jobToken,
      });
      await poll(parsed.data.jobToken, settings);
    } catch (error) {
      await persistGeneration({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Could not start generation.',
      });
    }
  };

  const enabled = canGenerate({
    person: Boolean(person),
    garment: Boolean(garment),
    consent: settings.consent,
    category: Boolean(category),
    status: generation.status,
  });

  return (
    <main className="shell min-h-screen">
      <header className="brand-row">
        <div className="mark">V</div>
        <div>
          <p className="eyebrow">Your private fitting room</p>
          <h1>Virtual Try-On</h1>
        </div>
        <button
          className="icon-button"
          title="Open settings"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          ⚙
        </button>
      </header>

      <nav className="view-tabs" aria-label="Virtual Try-On sections">
        <button
          aria-current={activeView === 'queue' ? 'page' : undefined}
          className={activeView === 'queue' ? 'active' : ''}
          onClick={() => setActiveView('queue')}
        >
          Queue
        </button>
        <button
          aria-current={activeView === 'try-on' ? 'page' : undefined}
          className={activeView === 'try-on' ? 'active' : ''}
          onClick={() => setActiveView('try-on')}
        >
          Single try-on
        </button>
      </nav>

      {activeView === 'queue' ? (
        <QueuePanel refreshKey={queueRefreshKey} onSelectFromPage={selectFromPage} />
      ) : !person || !settings.consent ? (
        <section className="card welcome">
          <p className="eyebrow">Welcome</p>
          <h2>See the piece on you</h2>
          <ol>
            <li>Add a clear body photo</li>
            <li>Choose a garment as you shop</li>
            <li>Create an approximate preview</li>
          </ol>
          <p className="muted">
            A front-facing full-body or three-quarter photo in even light works best. JPEG, PNG, or
            WebP; 10 MB max.
          </p>
          <ImageUpload
            label="Add your body photo"
            slot="person"
            image={person}
            onImage={setPerson}
          />
          <label className="consent">
            <input
              type="checkbox"
              checked={settings.consent}
              onChange={(event) => void updateConsent(event.target.checked)}
            />
            <span>I own this photo or have permission to process it.</span>
          </label>
          <p className="privacy-note">
            Your preferred photo stays in this browser until you press Generate.{' '}
            <button className="link" onClick={() => chrome.runtime.openOptionsPage()}>
              Privacy details
            </button>
          </p>
        </section>
      ) : generation.status === 'succeeded' && result ? (
        <section className="result-view">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your preview</p>
              <h2>{generation.isDemo ? 'Demo result' : 'Try-on result'}</h2>
            </div>
            {generation.isDemo && <span className="demo-badge">DEMO · NOT AI</span>}
          </div>
          <div className="comparison">
            <figure>
              <img src={personUrl} alt="Original body photo" />
              <figcaption>Before</figcaption>
            </figure>
            <figure>
              <img
                src={resultUrl}
                alt={generation.isDemo ? 'Demonstration result' : 'Generated try-on result'}
              />
              <figcaption>Preview</figcaption>
            </figure>
          </div>
          <div className="garment-chip">
            <img src={garmentUrl} alt="Selected garment" />
            <span>Selected garment</span>
          </div>
          <a className="button primary" href={resultUrl} download={result.name}>
            Download result
          </a>
          <button
            className="button secondary"
            onClick={async () => {
              await deleteImage('garment');
              await deleteImage('result');
              setGarment(undefined);
              setResult(undefined);
              await persistGeneration(idleGeneration);
            }}
          >
            Try another garment
          </button>
          <button className="link" onClick={() => void removePerson()}>
            Use a different body photo
          </button>
          <button
            className="link danger"
            onClick={async () => {
              await Promise.all([deleteImage('garment'), deleteImage('result')]);
              setGarment(undefined);
              setResult(undefined);
              await persistGeneration(idleGeneration);
            }}
          >
            Start over
          </button>
          <p className="disclaimer">
            This visual approximation does not predict size, fit, fabric drape, or measurements.
          </p>
        </section>
      ) : (
        <>
          <section className="photo-strip">
            <img src={personUrl} alt="Saved body photo" />
            <div>
              <p className="eyebrow">Saved privately</p>
              <strong>Your body photo</strong>
              <button
                className="link"
                onClick={() => document.getElementById('replace-photo')?.click()}
              >
                Change photo
              </button>
              <input
                id="replace-photo"
                hidden
                type="file"
                accept={ACCEPT}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    const next = await processImage(file, 'person', file.name);
                    await saveImage(next);
                    setPerson(next);
                    await updateConsent(false);
                  }
                }}
              />
              <button className="link danger" onClick={() => void removePerson()}>
                Delete photo
              </button>
            </div>
          </section>
          <section className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Step 1</p>
                <h2>Choose a garment</h2>
              </div>
            </div>
            <button className="button primary" onClick={() => void selectFromPage()}>
              Select garment from this page
            </button>
            <div className="or">
              <span>or</span>
            </div>
            <ImageUpload
              label="Upload garment screenshot"
              slot="garment"
              image={garment}
              onImage={(next) => {
                setGarment(next);
                if (next) {
                  void createCaptureDraft({ image: next }).then(() => {
                    setActiveView('queue');
                    setQueueRefreshKey((value) => value + 1);
                  });
                }
              }}
            />
            <p className="hint">A front-facing image with one unobstructed garment works best.</p>
            {notice && <p className="notice">{notice}</p>}
          </section>
          <section className="card">
            <p className="eyebrow">Step 2</p>
            <h2>Garment category</h2>
            <div className="categories" role="radiogroup" aria-label="Garment category">
              {(
                [
                  ['dress', 'Dress / one-piece'],
                  ['top', 'Top'],
                  ['bottom', 'Bottom'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={category === value ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="category"
                    value={value}
                    checked={category === value}
                    onChange={() => setCategory(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
          <button className="button generate" disabled={!enabled} onClick={() => void generate()}>
            {generation.status === 'submitting'
              ? 'Submitting…'
              : generation.status === 'processing'
                ? 'Creating preview…'
                : 'Generate try-on'}
          </button>
          {generation.message && (
            <p
              className={generation.status === 'failed' ? 'status error' : 'status'}
              role="status"
              aria-live="polite"
            >
              {generation.message}
              {generation.status === 'failed' && (
                <button className="link" onClick={() => void generate()}>
                  Retry
                </button>
              )}
            </p>
          )}
          <p className="disclaimer">
            Preview only. This does not guarantee fit, sizing, measurements, or fabric behavior.
          </p>
        </>
      )}
    </main>
  );
}
