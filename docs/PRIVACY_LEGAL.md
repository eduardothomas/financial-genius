# Privacidad, seguridad y marco legal

> Parte del Financial Genius Panamá — Product Master Spec v1 (14 oct 2026). Fuente de verdad: este repo.

## 10. Privacidad, seguridad y marco regulatorio

**Antes de lanzar públicamente hace falta una consulta con un abogado panameño en protección de datos y regulación financiera.** Esta sección lista las preguntas; no son respuestas legales.

### Privacidad desde el diseño

- Pedir solo los datos que la meta necesita; cada campo indica para qué se usa.
- Consentimiento explícito, granular y revocable; registro de cada consentimiento con fecha.
- Documentos procesados en memoria y borrados tras la confirmación; nunca usados para entrenar modelos.
- El usuario ve qué datos sustentan cada recomendación, puede corregirlos y puede borrar su cuenta y todos sus datos.
- No pedir contraseñas bancarias, números de tarjeta ni cédula completa en el MVP.
- Proveedor LLM configurado sin retención de datos para entrenamiento; datos mínimos en cada llamada.

### Seguridad

- Cifrado en tránsito (TLS) y en reposo; campos sensibles cifrados a nivel de aplicación.
- Autenticación con proveedor gestionado; MFA opcional; biometría en móvil.
- Registro de auditoría de accesos y de recomendaciones.
- Revisión básica de seguridad (OWASP Top 10, OWASP MASVS en móvil) antes del lanzamiento público.

### Preguntas regulatorias para el abogado

| Tema | Pregunta | Cuándo importa |
| --- | --- | --- |
| Datos personales | Qué exige la Ley 81 de 2019 y su reglamento para datos financieros: consentimiento, registro, transferencia a proveedores fuera de Panamá (nube, LLM) | MVP |
| Historial de crédito | Si se puede procesar un reporte APC que el usuario sube él mismo, y bajo qué condiciones | MVP |
| Recomendación de productos | Si recomendar productos bancarios sin cobrar requiere licencia o registro ante la Superintendencia de Bancos | MVP |
| Referidos y comisiones | Qué figura legal aplica al cobrar por referir clientes a bancos o enviar solicitudes | V3 |
| Protección al consumidor | Avisos obligatorios, términos de uso y descargo ("no es asesoría financiera, no garantiza aprobación") | MVP |
| Publicidad | Reglas para patrocinios de productos financieros | V3 |

### Conflicto de interés personal

Como trabajas en un banco (Banisi), revisa tu contrato y políticas internas antes de avanzar: cláusulas de exclusividad, propiedad intelectual de lo que desarrolles, uso de información del banco y competencia. Conviene que el catálogo trate a Banisi igual que a cualquier otro banco y usar solo información pública.
