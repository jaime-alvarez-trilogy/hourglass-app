// Noise texture density guard (NoiseOverlay, GlassCard, ApprovalCard).
// In a release build, iOS loads a bundled PNG that has no @2x/@3x sibling at scale 1, so a
// 256px noise tile covers 256pt and each noise pixel becomes a 3x3 block on a 3x phone. That is
// the coarse "grainy" look build 19 showed on device. Dev builds load the same file over HTTP,
// decode it at screen scale and draw one noise pixel per screen pixel, which is the look the
// brand rule (BRAND_GUIDELINES.md §Surface & Depth — Noise Texture) was tuned against.
// Shipping byte-identical @2x/@3x copies makes release pick the variant that matches the screen,
// so release and dev render the same 1-screen-pixel grain. Reads assets/ from disk on purpose.

import * as fs from 'fs';
import * as path from 'path';

const IMAGES = path.resolve(__dirname, '../../assets/images');
const VARIANTS = ['noise.png', 'noise@2x.png', 'noise@3x.png'];

// PNG IHDR: width and height are big-endian uint32 at byte offsets 16 and 20.
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('noise texture assets', () => {
  it.each(VARIANTS)('%s exists', (name) => {
    expect(fs.existsSync(path.join(IMAGES, name))).toBe(true);
  });

  it('every density variant is byte-identical to noise.png', () => {
    const base = fs.readFileSync(path.join(IMAGES, 'noise.png'));
    for (const name of VARIANTS.slice(1)) {
      expect(fs.readFileSync(path.join(IMAGES, name)).equals(base)).toBe(true);
    }
  });

  it('the tile is 256x256 pixels', () => {
    expect(pngSize(fs.readFileSync(path.join(IMAGES, 'noise.png')))).toEqual({ width: 256, height: 256 });
  });
});
