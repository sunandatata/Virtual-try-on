import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBodyProfile,
  getDefaultBodyProfile,
  listBodyProfiles,
} from '../lib/body-profile-storage';
import { clearAllLocalData } from '../lib/storage';
import { ProfilesPanel } from './ProfilesPanel';

vi.mock('../lib/images', () => ({
  processImage: vi.fn(async (_file: File, slot: 'person' | 'garment', name: string) => ({
    slot,
    blob: new Blob([name], { type: 'image/png' }),
    name,
    mime: 'image/png',
    width: 800,
    height: 1200,
    updatedAt: 500,
  })),
}));

function image(name: string) {
  return {
    blob: new Blob([name], { type: 'image/png' }),
    imageName: `${name}.png`,
    mime: 'image/png',
    width: 800,
    height: 1200,
  };
}

describe('ProfilesPanel', () => {
  beforeEach(async () => {
    await clearAllLocalData();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('creates, edits, replaces, defaults, and deletes local profiles', async () => {
    const front = await createBodyProfile({
      profileName: 'Front',
      image: image('front'),
      now: 100,
    });
    await createBodyProfile({ profileName: 'Side', image: image('side'), now: 200 });
    const user = userEvent.setup();
    render(<ProfilesPanel />);

    const frontCard = (await screen.findByText('Front')).closest('article')!;
    expect(within(frontCard).getByText('Default')).toBeVisible();
    const sideCard = screen.getByText('Side').closest('article')!;
    await user.click(within(sideCard).getByRole('button', { name: 'Make default' }));
    await waitFor(async () => expect((await getDefaultBodyProfile())?.profileName).toBe('Side'));

    const refreshedFrontCard = (await screen.findByText('Front')).closest('article')!;
    await user.click(within(refreshedFrontCard).getByRole('button', { name: 'Rename' }));
    const name = within(refreshedFrontCard).getByLabelText('Profile name');
    await user.clear(name);
    await user.type(name, 'Casual');
    await user.type(within(refreshedFrontCard).getByLabelText('Description'), 'Everyday pose');
    await user.click(within(refreshedFrontCard).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Casual')).toBeVisible();

    const casualCard = screen.getByText('Casual').closest('article')!;
    await user.upload(
      within(casualCard).getByLabelText('Replace Casual photo'),
      new File(['replacement'], 'replacement.png', { type: 'image/png' }),
    );
    await waitFor(async () =>
      expect((await listBodyProfiles()).find((profile) => profile.id === front.id)?.imageName).toBe(
        'replacement.png',
      ),
    );

    await user.type(screen.getByLabelText('Profile name'), 'Formal');
    await user.upload(
      screen.getByLabelText('Body photo'),
      new File(['formal'], 'formal.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(await screen.findByText('Formal')).toBeVisible();

    const refreshedCasualCard = screen.getByText('Casual').closest('article')!;
    await user.click(within(refreshedCasualCard).getByRole('button', { name: 'Delete' }));
    await waitFor(async () =>
      expect((await listBodyProfiles()).map((profile) => profile.profileName)).toEqual([
        'Side',
        'Formal',
      ]),
    );
  });
});
