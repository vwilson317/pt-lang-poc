// Soft Gradient Modern — design system tokens (design-spec Option #3)

export const theme = {
  // Core
  bg0: '#070A1A',
  bg1: '#0B1B4A',
  bg2: '#2B1C6B',
  surface: 'rgba(255,255,255,0.08)',
  surfaceStrong: 'rgba(255,255,255,0.12)',
  stroke: 'rgba(255,255,255,0.18)',
  textPrimary: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.72)',

  // Semantic
  good: '#35FF8A',
  bad: '#FF3D5A',
  info: '#22D3FF',
  brand: '#6A5CFF',

  // Layout
  hudHeight: 44,
  hudRadius: 22,
  cardWidthPercent: '88%',
  cardMinHeight: 160,
  cardMaxHeight: 200,
  cardRadius: 30,
  cardStagePaddingVertical: 24,
  ctaMinHeight: 52,
  ctaRadius: 26,
  optionRadius: 20,
  safeAreaTopOffset: 12,

  // Typography
  wordSize: 48,
  wordWeight: '800' as const,
  wordLetterSpacing: -0.5,
  buttonLabelSize: 17,
  buttonLabelWeight: '700' as const,
  hudNumberSize: 17,
  hudLabelSize: 12,
  iconSizeHud: 18,
  iconSizeButton: 20,

  // Shadows (soft, no neon)
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  borderRadius: 24,
};

// Gradient color arrays for LinearGradient
export const gradientBackgroundColors = [theme.bg0, theme.bg1, theme.bg2] as const;
export const cardSurfaceColors = ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.06)'] as const;
export const audioButtonColors = [theme.brand, '#5A4CE6'] as const;
