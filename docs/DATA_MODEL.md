# Modelo de datos

> Parte del Financial Genius Panamá — Product Master Spec v1 (14 oct 2026). Fuente de verdad: este repo.

## 8. Modelo de datos

**Catorce entidades cubren el MVP.** Los datos del usuario se guardan como snapshots fechados para poder recalcular y auditar; el catálogo se versiona.

| Entidad | Campos clave | Relaciones |
| --- | --- | --- |
| `User` | id, email, teléfono, idioma, plan (free/premium), consentimientos, creado | 1–N Goal, FinancialSnapshot, Conversation |
| `FinancialSnapshot` | ingreso neto, tipo de empleo, antigüedad, gastos fijos, dependientes, APC autodeclarado, fuente de cada campo (declarado / documento), fecha | N–1 User; 1–N Debt |
| `Debt` | tipo, institución, saldo, límite, pago mensual, atrasos | N–1 FinancialSnapshot |
| `Goal` | tipo (tarjeta / auto / hipoteca), prioridad, monto objetivo, fecha deseada, estado, índice de preparación actual | N–1 User; 1–N Obstacle, Plan |
| `ReadinessScore` | goal, snapshot, valor 0–100, desglose por factor, versión de pesos, fecha | N–1 Goal |
| `Obstacle` | goal, factor, evidencia, impacto en puntos, bloqueante sí/no, estado | N–1 Goal; 1–N Action |
| `Plan` | goal, mes, objetivo del mes, estado | N–1 Goal; 1–N Action |
| `Action` | plan, obstacle, título, semana, estado (pendiente / hecha / omitida), resultado | N–1 Plan |
| `Institution` | nombre, tipo, sitio web, logo | 1–N Product |
| `Product` + `ProductVersion` | tipo, segmento; versión con condiciones normalizadas (sección 7), fuente, vigencia | N–1 Institution |
| `Recommendation` | goal, productVersion, posición, puntaje, razones estructuradas, supuestos, versión de catálogo y pesos, fecha | N–1 Goal |
| `Conversation` + `Message` | contexto vinculado (goal, product), rol, contenido, tool calls | N–1 User |

**Fuera del modelo en el MVP:** documentos originales (se borran tras la extracción), datos de tarjeta, números de cédula completos y contraseñas bancarias.

**Tablas de configuración (no código):** pesos por meta, umbrales de factores, plantillas de misiones por freno.
