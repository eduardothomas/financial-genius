/** Tokens de diseño: esclusa del Canal (azul profundo), agua que sube (mango) y fondo frío. */
export const color = {
  lock: '#0E3B43', // azul de esclusa: texto principal, botones
  lockSoft: '#2C5A62',
  bg: '#F3F6F5', // fondo frío
  surface: '#FFFFFF',
  line: '#D5DEDC',
  muted: '#5B6D70',
  water: '#F2A541', // mango: el nivel de preparación
  waterDeep: '#C77D12',
  good: '#2F7D5B',
  warn: '#8A5300',
  warnBg: '#FFF2DC',
  error: '#A3302A',
  errorBg: '#FBE9E7',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Escala tipográfica (fuente del sistema). */
export const type = {
  display: { fontSize: 44, lineHeight: 48, fontWeight: '700' as const, letterSpacing: -1 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  tiny: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
};

export const radius = { sm: 6, md: 10, lg: 16 } as const;
export const maxWidth = 560;
