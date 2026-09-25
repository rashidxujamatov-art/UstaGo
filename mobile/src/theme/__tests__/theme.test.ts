import { buildTheme } from '../ThemeProvider';
import { fontSize, LARGE_TEXT_SCALE, palette } from '../tokens';

describe('buildTheme', () => {
  it('uses the palette of the chosen scheme', () => {
    expect(buildTheme('light', 1).colors.bar).toBe('#2461C2');
    expect(buildTheme('dark', 1).colors.bar).toBe('#212E3C');
  });

  it('scales every font size by 1.15 for large text (docs/03 §2.2)', () => {
    const large = buildTheme('light', LARGE_TEXT_SCALE);
    expect(large.fontSize.body).toBe(Math.round(fontSize.body * 1.15));
    expect(large.fontSize.amountLarge).toBe(Math.round(36 * 1.15));
  });

  it('has the same tokens in light and dark', () => {
    expect(Object.keys(palette.dark).sort()).toEqual(Object.keys(palette.light).sort());
  });
});
