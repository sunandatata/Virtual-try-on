import { beforeEach, describe, expect, it } from 'vitest';
import {
  createBodyProfile,
  deleteBodyProfile,
  getDefaultBodyProfile,
  listBodyProfiles,
  replaceBodyProfileImage,
  setDefaultBodyProfile,
  setBodyProfileConsent,
  updateBodyProfileDetails,
} from './body-profile-storage';
import { clearAllLocalData } from './storage';

function image(label: string) {
  return {
    blob: new Blob([label], { type: 'image/png' }),
    imageName: `${label}.png`,
    mime: 'image/png',
    width: 800,
    height: 1200,
  };
}

describe('body profile repository', () => {
  beforeEach(clearAllLocalData);

  it('creates a default profile and switches the default atomically', async () => {
    const front = await createBodyProfile({
      profileName: 'Front',
      image: image('front'),
      now: 100,
    });
    const formal = await createBodyProfile({
      profileName: 'Formal',
      description: '  formal event  ',
      image: image('formal'),
      now: 200,
    });

    expect(front.isDefault).toBe(true);
    expect(front.consent).toBe(false);
    expect(formal.description).toBe('formal event');
    await setDefaultBodyProfile(formal.id);
    expect(await getDefaultBodyProfile()).toMatchObject({ id: formal.id });
    expect((await listBodyProfiles()).find((profile) => profile.id === front.id)?.isDefault).toBe(
      false,
    );
  });

  it('stores consent per profile and resets it when the photo changes', async () => {
    const profile = await createBodyProfile({ profileName: 'Front', image: image('front') });
    expect(await setBodyProfileConsent(profile.id, true)).toMatchObject({ consent: true });
    expect(await replaceBodyProfileImage(profile.id, image('replacement'))).toMatchObject({
      consent: false,
    });
  });

  it('renames and replaces a profile image', async () => {
    const profile = await createBodyProfile({ profileName: 'Front', image: image('front') });
    expect(
      await updateBodyProfileDetails(profile.id, {
        profileName: 'Casual',
        description: 'Everyday pose',
      }),
    ).toMatchObject({ profileName: 'Casual', description: 'Everyday pose' });
    expect(await replaceBodyProfileImage(profile.id, image('replacement'))).toMatchObject({
      imageName: 'replacement.png',
    });
  });

  it('promotes another profile when deleting the default', async () => {
    const first = await createBodyProfile({
      profileName: 'Front',
      image: image('front'),
      now: 100,
    });
    const second = await createBodyProfile({ profileName: 'Side', image: image('side'), now: 200 });
    await deleteBodyProfile(first.id);
    expect(await listBodyProfiles()).toHaveLength(1);
    expect(await getDefaultBodyProfile()).toMatchObject({ id: second.id, isDefault: true });
  });

  it('validates missing and blank profiles', async () => {
    await expect(createBodyProfile({ profileName: ' ', image: image('blank') })).rejects.toThrow(
      'name is required',
    );
    await expect(setDefaultBodyProfile('missing')).rejects.toThrow('not found');
    await expect(deleteBodyProfile('missing')).rejects.toThrow('not found');
  });
});
