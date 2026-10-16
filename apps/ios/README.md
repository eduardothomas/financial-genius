# Financial Genius — iOS nativo

App de iOS en SwiftUI para iOS 26, con Liquid Glass. Reemplaza a la app Expo en iOS; Android y Web siguen con `apps/app`.

## Estructura

```text
apps/ios/
├── project.yml                ← XcodeGen (el .xcodeproj se genera, no se versiona)
├── FinancialGeniusCore/       ← paquete Swift sin UI (se prueba con `swift test`, también en Linux)
│   ├── Sources/…/Modelos.swift        contratos de la API v1
│   ├── Sources/…/APIClient.swift      cliente async/await (x-dev-user o Bearer)
│   ├── Sources/…/SupabaseAuth.swift   código por correo con la API REST de Supabase
│   ├── Sources/…/Formato.swift        textos y formatos (copia fiel de apps/app/src/lib/format.ts)
│   ├── Sources/…/Chat.swift           sugerencias y tarjetas del Genio
│   ├── Sources/…/PerfilFormulario.swift  formulario ↔ perfil, mismas reglas que la API
│   └── Tests/…/casos-dorados.json     generado desde TypeScript: iOS debe decir lo mismo
├── FinancialGenius/           ← la app
│   ├── App/                   entrada y pestañas (TabView de iOS 26, barra que se minimiza al bajar)
│   ├── Core/                  configuración, Llavero (Keychain), sesión y navegación
│   ├── DesignSystem/          colores (claro/oscuro), avisos, selector de meta, esclusa animada
│   └── Features/              Entrar, Genio, Metas (+ detalle y nueva meta), Plan, Productos, Perfil
├── maestro/                   recorrido con capturas para el CI
└── scripts/                   utilidades del CI
```

## Correr en tu Mac

Necesitas Xcode 26 y XcodeGen (`brew install xcodegen`).

```bash
# API local con datos demo (en la raíz del repo; ver README principal)
pnpm --filter @fg/api dev
pnpm exec tsx services/api/scripts/datos-demo.ts     # usuario demo@ejemplo.test

cd apps/ios
xcodegen                     # genera FinancialGenius.xcodeproj
open FinancialGenius.xcodeproj
```

Corre el esquema `FinancialGenius` en un simulador. Sin Supabase configurado, la app entra en modo desarrollo: solo pide el correo.

### Configuración

Se fija al compilar con estas variables de `project.yml` (o como argumentos de `xcodebuild`):

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `FG_API_URL` | URL de la API v1 | `http://localhost:3000` |
| `FG_SUPABASE_URL` | Proyecto de Supabase | vacío (modo desarrollo) |
| `FG_SUPABASE_ANON_KEY` | Clave anon (pública) de Supabase | vacío |

La clave `service_role` de Supabase nunca va en la app ni en el repo. La sesión se guarda en el Llavero, solo en ese dispositivo.

## Pruebas

```bash
cd apps/ios/FinancialGeniusCore && swift test
```

Los casos dorados vienen de `apps/app/scripts/casos-dorados.ts`. Si cambias textos o formatos en `apps/app/src/lib`, regenera el JSON con `pnpm --filter @fg/app casos-dorados` y ajusta el Swift hasta que pase. La prueba `casos-dorados.test.ts` de la app falla si el JSON quedó viejo.

## CI (`.github/workflows/ios.yml`)

- **núcleo**: `swift test` en Linux, en cada cambio de `apps/ios`.
- **app**: en macOS 26 con Xcode 26 (ramas `ios-*`, `main` o a mano). Genera el proyecto, compila, levanta PostgreSQL y la API con datos demo, recorre la app con Maestro y publica las capturas en la rama `capturas-movil`, carpeta `ios-nativo/`. macOS cuenta 10 veces los minutos.

Los errores de compilación y de pruebas aparecen como anotaciones del job.

## Pendiente para publicar en la App Store

- Cuenta de Apple Developer, firma y perfil de aprovisionamiento.
- Supabase de producción y URL HTTPS de la API.
- Iconos en variantes oscuro y tintado (Icon Composer).
