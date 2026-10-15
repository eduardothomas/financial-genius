# Configurar Supabase Auth

La app entra con un **código de un solo uso enviado al correo** (sin contraseñas). La API verifica el
token de Supabase con las claves públicas del proyecto (JWKS, ES256/RS256).

## Pasos (una vez)

1. Crea un proyecto en [supabase.com](https://supabase.com) (región más cercana: `us-east-1`).
2. **Authentication → Sign In / Providers → Email**: activado. Desactiva el registro con contraseña si no se usa.
3. **Authentication → Emails → Templates → Magic Link**: el correo debe incluir el código. Ejemplo:

   ```html
   <h2>Tu código para entrar a Financial Genius</h2>
   <p>Escribe este código en la app: <strong>{{ .Token }}</strong></p>
   <p>Vence en 1 hora. Si no pediste entrar, ignora este correo.</p>
   ```

4. **Authentication → Emails → SMTP**: configura un proveedor propio (Resend, Postmark, SES) antes de
   lanzar; el correo de prueba de Supabase tiene un límite muy bajo de envíos por hora.
5. **Project Settings → JWT Keys**: usa claves de firma asimétricas (ES256). Si el proyecto aún usa el
   "Legacy JWT secret", migra a JWT Signing Keys o configura `AUTH_JWT_SECRET` en la API mientras tanto.
6. **Project Settings → API**: copia la **Project URL** y la **anon** (o **publishable**) key.

## Variables

| Dónde | Variable | Valor |
| --- | --- | --- |
| `services/api` | `SUPABASE_URL` | Project URL, ej. `https://abcd1234.supabase.co` |
| `services/api` | `AUTH_JWT_SECRET` | Solo con el secreto heredado (HS256) |
| `apps/app` | `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `apps/app` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon o publishable key (pública por diseño) |

Nunca pongas la **service_role** (o secret) key en la app ni en el repo.

## Qué verifica la API

Firma (JWKS en caché 10 min, refresca ante un `kid` nuevo), `exp`/`nbf`, `iss` = `<SUPABASE_URL>/auth/v1`,
`aud` = `authenticated`, rol `authenticated`, `sub` y `email`. Rechaza la anon key, `alg: none` y HS256
si no hay secreto heredado configurado.

Referencias: [JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys) ·
[JWTs en Supabase](https://supabase.com/docs/guides/auth/jwts)
