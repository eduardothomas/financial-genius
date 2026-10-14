# Catálogo bancario

> Parte del Financial Genius Panamá — Product Master Spec v1 (14 oct 2026). Fuente de verdad: este repo.

## 7. Catálogo bancario y fuentes de datos

**El catálogo es el activo más valioso y el más difícil de mantener.** En el MVP se carga y revisa a mano desde fuentes públicas; cada dato lleva fuente y fecha.

### Alcance inicial

- **Bancos:** 8–12 de los principales del país (por ejemplo Banco General, Banistmo, BAC, Caja de Ahorros, Global Bank, Banesco, Multibank, Davivienda, Banco Nacional). Lista final a definir.
- **Productos:** tarjetas de crédito (incluidas aseguradas), préstamos de auto e hipotecas; unos 40–60 en total.

### Campos normalizados por producto

| Grupo | Campos |
| --- | --- |
| Identidad | banco, nombre, tipo, segmento, URL oficial |
| Costo | tasa anual (rango), anualidad, cargos, seguros obligatorios, costo de cierre |
| Requisitos públicos | ingreso mínimo, antigüedad laboral, edad, nacionalidad o residencia, tipo de empleo aceptado |
| Condiciones | plazo mínimo y máximo, monto, % de financiamiento, abono mínimo |
| Beneficios | cashback, millas, puntos, promociones con vigencia |
| Trazabilidad | fuente (URL o documento), fecha de captura, verificado por, vigente desde/hasta |

### Fuentes por orden de confianza

1. Sitio web oficial y tarifarios publicados por cada banco.
2. Información pública de la Superintendencia de Bancos de Panamá.
3. Llamada o visita a sucursal (marcado como "confirmado por teléfono", con fecha).
4. Reportes de usuarios (V2, siempre como dato no verificado).

### Operación

- Panel admin interno para crear y versionar productos (`ProductVersion`); nunca se edita en sitio.
- Revisión mensual de todo el catálogo; tasas y promociones cada 2 semanas.
- Productos sin revisar en 60 días se marcan "dato posiblemente desactualizado".
- La captura se automatiza por etapas; ver "Captura automática del catálogo" abajo.

### Captura automática del catálogo

**La meta es que una persona solo apruebe cambios, no que los busque ni los transcriba.** Un pipeline rastrea las fuentes oficiales, detecta cambios, extrae los datos con IA y propone una nueva versión del producto para revisión.

1. **Registro de fuentes:** cada producto guarda sus URLs oficiales (página del producto, tarifario en PDF, términos y condiciones).
2. **Rastreo programado:** un job semanal (Playwright) descarga cada fuente, con baja frecuencia y respetando `robots.txt` y los términos de uso de cada sitio.
3. **Detección de cambios:** se normaliza el texto y se compara su hash con la última captura. Si nada cambió, el proceso termina ahí.
4. **Extracción con IA:** el LLM convierte el HTML o PDF en el esquema de `ProductVersion` (salida JSON estructurada). Cada campo guarda la cita textual de la que salió.
5. **Validación automática:** campos obligatorios, rangos razonables (por ejemplo, una tasa anual entre 0% y 60%) y comparación campo a campo contra la versión vigente.
6. **Revisión humana:** el panel admin muestra el cambio propuesto lado a lado con la cita de origen; se aprueba o rechaza con un clic.
7. **Publicación:** lo aprobado crea una nueva `ProductVersion` con fuente y fecha; los rankings afectados se recalculan.

| Fase | Nivel de automatización | Qué hace la persona |
| --- | --- | --- |
| MVP 1 | Pegar una URL o un PDF en el admin; la IA propone la ficha completa | Revisa y aprueba cada ficha (minutos en lugar de horas) |
| V2 | Rastreo semanal + detección de cambios + extracción automática | Solo revisa los cambios detectados |
| V2+ | Auto-aprobación de cambios de bajo riesgo (promociones, beneficios) cuando la precisión medida supere ~95% | Revisa tasas, requisitos y muestras aleatorias |
| V3 | Feeds o APIs directos de bancos aliados (a cambio de leads o referidos) | Supervisa; el banco es la fuente |

**Fuentes complementarias:** reportes de usuarios sobre la oferta real que recibieron (V2, marcados como no verificados) y datos públicos de la Superintendencia de Bancos cuando existan.

**Límites a tener en cuenta:**

- Muchos bancos no publican requisitos ni tasas exactas ("desde X%"); la tasa final depende del perfil. El catálogo guarda rangos y lo dice así.
- Los sitios cambian de diseño y el rastreo se rompe. La extracción con IA es más robusta que los selectores fijos, pero hay que monitorear fallos.
- Revisar con el abogado si el rastreo de sitios públicos de bancos es aceptable según sus términos de uso.

### Datos del usuario

- **MVP:** todo autodeclarado o extraído de un documento que el usuario sube y confirma.
- **APC:** la app no consulta la APC. El usuario puede escribir lo que sabe ("tengo buen historial", "tuve un atraso en 2024") o subir su propio reporte para extraer datos. Validar si el reporte se puede procesar así antes de construirlo.
- **V3:** integraciones autorizadas si el mercado lo permite (no existe hoy una API abierta de banca en Panamá que se pueda asumir).
