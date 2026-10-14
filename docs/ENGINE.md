# Motor de preparación y recomendación

> Parte del Financial Genius Panamá — Product Master Spec v1 (14 oct 2026). Fuente de verdad: este repo.

## 6. Motor de preparación y recomendación

**Tres capas separadas: reglas deterministas calculan, el catálogo aporta los datos, el LLM solo conversa y explica.** El ranking debe ser reproducible: mismo perfil + misma versión del catálogo = mismo resultado.

### Capa 1 — Cálculos financieros (código puro, con tests)

- **Ratio deuda/ingreso (DTI):** pagos mensuales de deuda ÷ ingreso mensual neto.
- **Capacidad de pago:** ingreso − gastos fijos − deudas − colchón mínimo.
- **Cuota estimada** del producto (tasa, plazo, monto) con fórmula de amortización estándar.
- **Utilización de crédito:** saldo de tarjetas ÷ límites.
- **Abono/enganche disponible** frente al requerido (auto, casa).

### Capa 2 — Índice de preparación por meta (0–100)

Puntaje propio, explicable, por meta. No es el APC y se muestra separado. Cada meta tiene su receta de factores con pesos configurables (no en código):

| Factor | Tarjeta | Auto | Hipoteca |
| --- | --- | --- | --- |
| Ingreso vs. mínimo del mercado | Alto | Alto | Alto |
| DTI con la nueva cuota | Medio | Alto | Muy alto |
| Antigüedad laboral | Medio | Alto | Alto |
| Historial APC autodeclarado | Alto | Alto | Muy alto |
| Abono disponible | — | Alto | Muy alto |
| Utilización de crédito | Medio | Medio | Alto |
| Documentación lista | Bajo | Medio | Alto |

Cada factor por debajo de su umbral genera un **freno** (`Obstacle`) con evidencia, impacto estimado en puntos y misiones sugeridas. Se muestran los 4 frenos de mayor impacto.

**Umbral "listo para comparar":** índice ≥ 70 y ningún freno bloqueante (por ejemplo, ingreso bajo el mínimo de todos los productos). Bajo el umbral, el top 3 igual se puede ver, marcado como "aún no recomendado aplicar".

### Capa 3 — Ranking de productos

1. **Filtro duro:** quita productos cuyos requisitos públicos el usuario no cumple (ingreso mínimo, antigüedad, nacionalidad o residencia, edad).
2. **Puntaje de ajuste** con pesos por meta: costo total (tasa, cargos, anualidad), probabilidad relativa de cumplir requisitos, beneficios alineados a preferencias (cashback, millas, plazo) y cuota vs. capacidad de pago.
3. **Top 3 + razones:** cada producto guarda 2–4 razones estructuradas y sus supuestos. El LLM las convierte en lenguaje natural sin agregar datos.
4. **Auditoría:** se guarda versión del catálogo, versión de pesos, snapshot del perfil y resultado.

**Regla de oro:** ningún campo comercial (comisión, patrocinio) entra al cálculo del ranking. Esto se aplica en el código y se prueba con un test.

### Rol del LLM

- Conduce la conversación y decide la siguiente pregunta según los datos que faltan para la meta.
- Extrae datos de texto libre y de documentos a campos estructurados, que el usuario siempre confirma.
- Explica frenos, misiones y ranking a partir de los datos estructurados (tool calling hacia el motor).
- Nunca inventa tasas, requisitos ni aprobaciones. Si un dato no está en el catálogo, lo dice.
