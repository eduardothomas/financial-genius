# @fg/app — app Expo (Web, iOS, Android)

Un solo código para las tres plataformas (Expo Router). Pestañas: **Metas**, **Plan**, **Productos** y **Perfil**.
El chat (pestaña Genio) llega en una fase siguiente.

```bash
cp .env.example .env          # EXPO_PUBLIC_API_URL apunta a services/api
pnpm --filter @fg/api dev     # en otra terminal
pnpm --filter @fg/app web     # navegador
pnpm --filter @fg/app ios     # simulador (macOS)
pnpm --filter @fg/app android
pnpm --filter @fg/app test    # lógica: cliente API, formatos, formulario de perfil
```

## Diseño

El índice de preparación se muestra como el **nivel de agua de una esclusa**: sube con tu preparación y la línea
marca el 70, desde donde recomendamos aplicar. Es el único elemento llamativo; lo demás es sobrio.

| Token | Valor | Uso |
| --- | --- | --- |
| `lock` | `#0E3B43` | Texto principal y botones |
| `bg` | `#F3F6F5` | Fondo |
| `water` | `#F2A541` | Nivel de preparación |
| `good` | `#2F7D5B` | Misiones hechas |
| `warn` | `#8A5300` | Avisos |

## Estado

- Sesión: con `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` se entra con un código enviado al correo (Supabase Auth, ver `docs/SUPABASE_AUTH.md`); sin ellas, modo de desarrollo con solo el correo (`x-dev-user`).
- Pestaña **Genio**: chat con herramientas sobre la API (requiere `ANTHROPIC_API_KEY` en la API).
- La lógica (`src/lib`) tiene pruebas; las pantallas se revisan con la vista previa web que publica el CI.
