import { qrCodeSchema } from '@miramenu/contracts';
import { generateQrCode } from './qr-code';

describe('generateQrCode', () => {
  it('produces codes the contract accepts', () => {
    for (let index = 0; index < 500; index += 1) {
      expect(qrCodeSchema.safeParse(generateQrCode()).success).toBe(true);
    }
  });

  it('spreads codes over the alphabet instead of repeating them', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateQrCode));
    expect(codes.size).toBe(2000);
  });
});
