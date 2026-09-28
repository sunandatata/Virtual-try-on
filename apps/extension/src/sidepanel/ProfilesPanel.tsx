import { useCallback, useEffect, useState } from 'react';
import { processImage } from '../lib/images';
import {
  createBodyProfile,
  deleteBodyProfile,
  listBodyProfiles,
  replaceBodyProfileImage,
  setDefaultBodyProfile,
  setBodyProfileConsent,
  updateBodyProfileDetails,
} from '../lib/body-profile-storage';
import type { BodyProfile, BodyProfileImage } from '../lib/body-profile-storage';

function profileImage(image: Awaited<ReturnType<typeof processImage>>): BodyProfileImage {
  return {
    blob: image.blob,
    imageName: image.name,
    mime: image.mime,
    width: image.width,
    height: image.height,
  };
}

function ProfilePreview({ profile }: { profile: BodyProfile }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(profile.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [profile.blob]);
  return url ? <img src={url} alt={`${profile.profileName} body profile`} /> : null;
}

function ProfileCard({ profile, onChanged }: { profile: BodyProfile; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [profileName, setProfileName] = useState(profile.profileName);
  const [description, setDescription] = useState(profile.description ?? '');
  const [error, setError] = useState('');

  return (
    <article className="profile-card">
      <ProfilePreview profile={profile} />
      <div className="profile-card-copy">
        {editing ? (
          <>
            <label>
              Profile name
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </label>
            <label>
              Description
              <input
                value={description}
                placeholder="Front, side, formal, casual…"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <strong>{profile.profileName}</strong>
            <span>{profile.description ?? 'No description'}</span>
            {profile.isDefault && <span className="default-badge">Default</span>}
          </>
        )}
      </div>
      <div className="profile-actions">
        {editing ? (
          <>
            <button
              onClick={async () => {
                try {
                  await updateBodyProfileDetails(profile.id, { profileName, description });
                  setEditing(false);
                  setError('');
                  onChanged();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Could not save profile.');
                }
              }}
            >
              Save
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)}>Rename</button>
            {!profile.isDefault && (
              <button
                onClick={async () => {
                  await setDefaultBodyProfile(profile.id);
                  onChanged();
                }}
              >
                Make default
              </button>
            )}
            <label className="profile-consent">
              <input
                type="checkbox"
                checked={profile.consent}
                onChange={async (event) => {
                  await setBodyProfileConsent(profile.id, event.target.checked);
                  onChanged();
                }}
              />
              Allow generation with this photo
            </label>
            <label className="profile-replace">
              Replace photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={`Replace ${profile.profileName} photo`}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const image = await processImage(file, 'person', file.name);
                    await replaceBodyProfileImage(profile.id, profileImage(image));
                    setError('');
                    onChanged();
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : 'Could not replace photo.');
                  } finally {
                    event.target.value = '';
                  }
                }}
              />
            </label>
            <button
              className="danger"
              onClick={async () => {
                if (!window.confirm(`Delete the ${profile.profileName} body profile?`)) return;
                try {
                  await deleteBodyProfile(profile.id);
                  onChanged();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Could not delete profile.');
                }
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="status error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

export function ProfilesPanel() {
  const [profiles, setProfiles] = useState<BodyProfile[]>([]);
  const [profileName, setProfileName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setProfiles(await listBodyProfiles());
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load body profiles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  return (
    <section className="card profiles-section" aria-labelledby="profiles-title">
      <p className="eyebrow">Stored only in this extension</p>
      <h2 id="profiles-title">Body profiles</h2>
      <p className="muted">
        Save reusable poses locally. A photo is sent only after you explicitly confirm a generation.
      </p>
      <form
        className="profile-create"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!file || !profileName.trim()) return;
          setSaving(true);
          try {
            const image = await processImage(file, 'person', file.name);
            await createBodyProfile({ profileName, description, image: profileImage(image) });
            setProfileName('');
            setDescription('');
            setFile(undefined);
            setError('');
            await load();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not create profile.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Profile name
          <input
            value={profileName}
            maxLength={80}
            placeholder="Front"
            onChange={(event) => setProfileName(event.target.value)}
          />
        </label>
        <label>
          Description
          <input
            value={description}
            maxLength={200}
            placeholder="Optional: casual, formal, side…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="profile-file">
          Body photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
        <button className="button primary" disabled={saving || !file || !profileName.trim()}>
          {saving ? 'Saving…' : 'Create profile'}
        </button>
      </form>
      {error && (
        <p className="status error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading profiles…</p>
      ) : profiles.length === 0 ? (
        <div className="queue-empty">
          <strong>No body profiles yet</strong>
          <span>Add a clear photo above. It remains local until generation.</span>
        </div>
      ) : (
        <div className="profile-list">
          {profiles.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} onChanged={() => void load()} />
          ))}
        </div>
      )}
    </section>
  );
}
