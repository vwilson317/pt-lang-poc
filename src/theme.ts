export const theme = {
  // Core palette (Flashy Violet Pulse)
  support700: '#462964',
  dominant500: '#9C54D5',
  accent400: '#5EE2F0',
  brandGradient: 'linear-gradient(135deg, #462964 0%, #9C54D5 52%, #5EE2F0 100%)',

  // Core surfaces / text
  bg0: '#140D20',
  bg1: '#1B1230',
  bg2: '#2A1B3F',
  surface: 'rgba(255, 255, 255, 0.06)',
  surfaceStrong: '#221533',
  stroke: '#3A2A50',
  strokeSoft: 'rgba(183, 174, 201, 0.26)',
  textPrimary: '#FFFFFF',
  textMuted: '#FFFFFF',
  textOnDark: '#FFFFFF',

  // Semantic aliases (used across existing UI)
  good: '#68D29C',
  bad: '#E5748F',
  info: '#5EE2F0',
  brand: '#5A357E',
  selected: '#9C54D5',
  selectedBg: 'rgba(156, 84, 213, 0.28)',
  selectedBorder: 'rgba(156, 84, 213, 0.7)',
  accentBg: 'rgba(94, 226, 240, 0.2)',
  link: '#C9A7FF',
  warning: '#EBC470',
  warningBg: 'rgba(235, 196, 112, 0.18)',
  warningBorder: 'rgba(235, 196, 112, 0.45)',
  success: '#68D29C',
  successBg: 'rgba(104, 210, 156, 0.18)',
  successBorder: 'rgba(104, 210, 156, 0.45)',
  overlayStrong: 'rgba(20, 13, 32, 0.84)',
  overlaySoft: 'rgba(20, 13, 32, 0.58)',
  panelBg: '#221533',
  panelBgMuted: '#2A1B3F',

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
    shadowColor: '#05020B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 9,
  },
  borderRadius: 24,
};

// Gradient color arrays for LinearGradient
export const gradientBackgroundColors = [theme.bg0, theme.bg1, theme.bg2] as const;
export const cardSurfaceColors = ['rgba(255,255,255,0.2)', 'rgba(255,255,255,0.08)'] as const;
export const audioButtonColors = [theme.support700, theme.dominant500] as const;
