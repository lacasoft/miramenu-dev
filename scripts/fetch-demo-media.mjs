// Downloads the demo photos and videos from Pexels into .cache/demo-media/ (ignored by git),
// for the development seed (npm run dev:seed-demo -w api). Pexels license: free to use,
// commercial use included, no attribution required; the files are never committed
// (decided 2026-11-09). No API key: fixed file URLs, each verified by its SHA-256.
//   node scripts/fetch-demo-media.mjs
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'demo-media');

/** The seed (apps/api/src/cli/seed-demo.ts) uses these files by name. */
const DEMO_MEDIA = [
  {
    file: 'trompo.jpg',
    source: 'https://www.pexels.com/photo/man-cooking-meat-on-skewer-in-street-restaurant-13201061/',
    url: 'https://images.pexels.com/photos/13201061/pexels-photo-13201061.jpeg',
    sha256: '3a454c14557c0c3c01817d948e81a794b85d7939762f1725c5f9ec4f6e03c7c3',
  },
  {
    file: 'tacos-plate.jpg',
    source: 'https://www.pexels.com/photo/close-up-shot-of-tacos-14179985/',
    url: 'https://images.pexels.com/photos/14179985/pexels-photo-14179985.jpeg',
    sha256: '9ec84d032f1b64f197c5e39b1eff4f095fdfdf0b59d68ed092c696d71f272e86',
  },
  {
    file: 'tacos-variety.jpg',
    source: 'https://www.pexels.com/photo/close-up-shot-of-mexican-food-9258703/',
    url: 'https://images.pexels.com/photos/9258703/pexels-photo-9258703.jpeg',
    sha256: '6c959f84a1066c25f49cd0292dea83a2c6df590e82e2619250aa55e8e5af5248',
  },
  {
    file: 'making-a-taco.mp4',
    source: 'https://www.pexels.com/video/a-man-making-a-taco-8448185/',
    url: 'https://videos.pexels.com/video-files/8448185/8448185-hd_1080_1920_24fps.mp4',
    sha256: 'df10ef5242b5e804aeb4272798e014b95d7518beebbb26cf42183cbb8a19e760',
  },
  {
    file: 'plate-of-tacos.mp4',
    source: 'https://www.pexels.com/video/a-person-holding-a-plate-of-tacos-8448099/',
    url: 'https://videos.pexels.com/video-files/8448099/8448099-hd_1080_1920_24fps.mp4',
    sha256: 'e1f54df1d88d82aabfb15c830130084c02d22ab737ba07719439dbcbd0e4801d',
  },
  {
    file: 'getting-tacos.mp4',
    source: 'https://www.pexels.com/video/people-getting-tacos-7613582/',
    url: 'https://videos.pexels.com/video-files/7613582/7613582-hd_1080_1920_24fps.mp4',
    sha256: 'd1ec949c8dc56732e38132e5105679e0267f5d84b5afe218d459a08661d3b9c3',
  },
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fetchOne({ file, url, sha256: expected }) {
  const target = join(cacheDir, file);
  if (existsSync(target) && sha256(await readFile(target)) === expected) {
    return 'cached';
  }
  const response = await fetch(url, { headers: { 'User-Agent': 'miramenu-dev-seed' } });
  if (!response.ok) throw new Error(`${file}: ${url} answered ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== expected) {
    throw new Error(`${file}: the downloaded file does not match its SHA-256; Pexels may have changed it`);
  }
  // Written aside and renamed, so a half-written file never passes for a downloaded one.
  const partial = `${target}.partial`;
  await writeFile(partial, bytes);
  await rename(partial, target);
  return 'downloaded';
}

async function main() {
  await mkdir(cacheDir, { recursive: true });
  for (const medium of DEMO_MEDIA) {
    try {
      console.log(`${medium.file}: ${await fetchOne(medium)}`);
    } catch (error) {
      await rm(join(cacheDir, `${medium.file}.partial`), { force: true });
      throw error;
    }
  }
  console.log(`Demo media ready in ${cacheDir}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
