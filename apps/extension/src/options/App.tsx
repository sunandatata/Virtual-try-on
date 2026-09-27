import { useEffect, useState } from 'react';
import { processImage } from '../lib/images';
import { clearAllLocalData, deleteImage, getImage, saveImage } from '../lib/storage';
import { DEFAULT_SETTINGS, getSettings, saveSettings, validateApiUrl } from '../lib/settings';
import type { ExtensionSettings } from '../lib/settings';

export function OptionsApp() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [message, setMessage] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);
  useEffect(() => {
    void Promise.all([getSettings(), getImage('person')]).then(([saved, photo]) => {
      setSettings(saved);
      setHasPhoto(Boolean(photo));
    });
  }, []);

  const save = async () => {
    try {
      const next = { ...settings, apiUrl: validateApiUrl(settings.apiUrl) };
      await saveSettings(next);
      setSettings(next);
      setMessage('Settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save settings.');
    }
  };

  return (
    <main className="shell settings-shell min-h-screen">
      <header className="brand-row">
        <div className="mark">V</div>
        <div>
          <p className="eyebrow">Virtual Try-On</p>
          <h1>Settings & privacy</h1>
        </div>
      </header>
      <section className="card">
        <h2>Service</h2>
        <label className="field">
          Backend URL
          <input
            type="url"
            value={settings.apiUrl}
            onChange={(event) => setSettings({ ...settings, apiUrl: event.target.value })}
          />
          <small>
            HTTPS is required except for local development. Your build must list this origin as
            optional access.
          </small>
        </label>
        <label className="field">
          Optional MVP access code
          <input
            type="password"
            autoComplete="off"
            value={settings.accessCode}
            onChange={(event) => setSettings({ ...settings, accessCode: event.target.value })}
          />
        </label>
        <button className="button primary" onClick={() => void save()}>
          Save settings
        </button>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
      </section>
      <section className="card">
        <h2>Your local data</h2>
        <p>
          Body, garment, and result images are stored in this extension's private IndexedDB. They
          are sent only when you explicitly generate a preview.
        </p>
        <button
          className="button secondary"
          onClick={async () => {
            await clearAllLocalData();
            setSettings(DEFAULT_SETTINGS);
            setHasPhoto(false);
            setMessage('All locally stored images, consent, settings, and job state were deleted.');
          }}
        >
          Clear all locally stored data
        </button>
        {hasPhoto && (
          <div className="button-row local-photo-actions">
            <label className="button secondary">
              Replace body photo
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const image = await processImage(file, 'person', file.name);
                    await saveImage(image);
                    const next = { ...settings, consent: false };
                    await saveSettings(next);
                    setSettings(next);
                    setMessage('Photo replaced. Confirm permission again in the side panel.');
                  } catch (error) {
                    setMessage(
                      error instanceof Error ? error.message : 'Could not replace the photo.',
                    );
                  }
                }}
              />
            </label>
            <button
              className="button secondary"
              onClick={async () => {
                await deleteImage('person');
                const next = { ...settings, consent: false };
                await saveSettings(next);
                setSettings(next);
                setHasPhoto(false);
                setMessage('Saved body photo deleted.');
              }}
            >
              Delete body photo
            </button>
          </div>
        )}
      </section>
      <section className="card">
        <h2>Privacy at a glance</h2>
        <ul>
          <li>No automatic page scanning or product scraping.</li>
          <li>No provider key is stored in this extension.</li>
          <li>
            Submitted images are processed transiently by your configured backend and provider.
          </li>
          <li>Results are approximate and do not guarantee fit or sizing.</li>
        </ul>
        <p>
          The full draft disclosure is packaged as <code>PRIVACY.md</code> in the repository. The
          publisher must host that notice and add the final public URL before a Web Store
          submission.
        </p>
      </section>
    </main>
  );
}
