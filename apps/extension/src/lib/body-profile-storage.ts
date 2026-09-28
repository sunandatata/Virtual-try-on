import { openDatabase } from './database';
import type { BodyProfile } from './database';

export type { BodyProfile } from './database';

export type BodyProfileImage = Pick<
  BodyProfile,
  'blob' | 'imageName' | 'mime' | 'width' | 'height'
>;

function createId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `profile-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function clean(value: string, maximum: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export async function listBodyProfiles(): Promise<BodyProfile[]> {
  return (await openDatabase()).getAllFromIndex('bodyProfiles', 'by-created-at');
}

export async function getBodyProfile(id: string): Promise<BodyProfile | undefined> {
  return (await openDatabase()).get('bodyProfiles', id);
}

export async function getDefaultBodyProfile(): Promise<BodyProfile | undefined> {
  return (await listBodyProfiles()).find((profile) => profile.isDefault);
}

export async function createBodyProfile(input: {
  profileName: string;
  description?: string;
  image: BodyProfileImage;
  makeDefault?: boolean;
  now?: number;
}): Promise<BodyProfile> {
  const profileName = clean(input.profileName, 80);
  if (!profileName) throw new Error('Profile name is required.');
  const database = await openDatabase();
  const transaction = database.transaction('bodyProfiles', 'readwrite');
  const existing = await transaction.store.getAll();
  const now = input.now ?? Date.now();
  const makeDefault = input.makeDefault || existing.length === 0;
  const profile: BodyProfile = {
    id: createId(),
    profileName,
    description: clean(input.description ?? '', 200) || undefined,
    ...input.image,
    createdAt: now,
    updatedAt: now,
    imageUpdatedAt: now,
    isDefault: makeDefault,
    consent: false,
  };
  if (makeDefault) {
    await Promise.all(
      existing
        .filter((candidate) => candidate.isDefault)
        .map((candidate) => transaction.store.put({ ...candidate, isDefault: false })),
    );
  }
  await transaction.store.add(profile);
  await transaction.done;
  return profile;
}

export async function updateBodyProfileDetails(
  id: string,
  details: { profileName: string; description?: string },
): Promise<BodyProfile> {
  const profileName = clean(details.profileName, 80);
  if (!profileName) throw new Error('Profile name is required.');
  const database = await openDatabase();
  const transaction = database.transaction('bodyProfiles', 'readwrite');
  const current = await transaction.store.get(id);
  if (!current) throw new Error('Body profile not found.');
  const updated = {
    ...current,
    profileName,
    description: clean(details.description ?? '', 200) || undefined,
    updatedAt: Date.now(),
  };
  await transaction.store.put(updated);
  await transaction.done;
  return updated;
}

export async function replaceBodyProfileImage(
  id: string,
  image: BodyProfileImage,
): Promise<BodyProfile> {
  const database = await openDatabase();
  const transaction = database.transaction(['bodyProfiles', 'batches'], 'readwrite');
  const profileStore = transaction.objectStore('bodyProfiles');
  const current = await profileStore.get(id);
  if (!current) throw new Error('Body profile not found.');
  const batches = await transaction.objectStore('batches').getAll();
  if (
    batches.some((batch) => batch.profileId === id && ['queued', 'running'].includes(batch.status))
  ) {
    throw new Error('This profile is being used by an active generation.');
  }
  const now = Date.now();
  const updated = { ...current, ...image, consent: false, updatedAt: now, imageUpdatedAt: now };
  await profileStore.put(updated);
  await transaction.done;
  return updated;
}

export async function setBodyProfileConsent(id: string, consent: boolean): Promise<BodyProfile> {
  const database = await openDatabase();
  const transaction = database.transaction('bodyProfiles', 'readwrite');
  const current = await transaction.store.get(id);
  if (!current) throw new Error('Body profile not found.');
  const updated = { ...current, consent, updatedAt: Date.now() };
  await transaction.store.put(updated);
  await transaction.done;
  return updated;
}

export async function setDefaultBodyProfile(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction('bodyProfiles', 'readwrite');
  const profiles = await transaction.store.getAll();
  if (!profiles.some((profile) => profile.id === id)) throw new Error('Body profile not found.');
  await Promise.all(
    profiles.map((profile) => transaction.store.put({ ...profile, isDefault: profile.id === id })),
  );
  await transaction.done;
}

export async function deleteBodyProfile(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(['bodyProfiles', 'batches'], 'readwrite');
  const profileStore = transaction.objectStore('bodyProfiles');
  const profile = await profileStore.get(id);
  if (!profile) throw new Error('Body profile not found.');
  const batches = await transaction.objectStore('batches').getAll();
  if (
    batches.some((batch) => batch.profileId === id && ['queued', 'running'].includes(batch.status))
  ) {
    throw new Error('This profile is being used by an active generation.');
  }
  await profileStore.delete(id);
  if (profile.isDefault) {
    const remaining = (await profileStore.getAll()).sort((a, b) => a.createdAt - b.createdAt);
    if (remaining[0]) await profileStore.put({ ...remaining[0], isDefault: true });
  }
  await transaction.done;
}
