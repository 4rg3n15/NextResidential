# ADR-003 · El hardware va al final, y eso es una prueba, no una concesión

- **Estado:** Aceptada
- **Fecha:** 2026-09-06 (formalización en la ETAPA 00)
- **Origen:** `CLAUDE.md` §4, ADR-03
- **Afecta a:** todas las etapas · OE-03 · KPI-11 · KPI-12

## Contexto

La integración real con hardware Hikvision pesa el **25 %** de la evaluación del proyecto. La intuición sugeriría abordarla temprano, para reducir riesgo. El orden de construcción sugerido en §13.5 del documento de requisitos, de hecho, coloca la integración con cámara y talanquera en la fase 3 de 8.

Sin embargo, OE-03 exige algo más fuerte que «integrar»: exige que _«la lógica de negocio y la interfaz no dependan de un fabricante»_, y lo verifica así: _«Ninguna llamada a ISAPI ni dirección de dispositivo existe fuera de la capa de proveedor; **la suite de pruebas corre completa con un adaptador simulado, sin hardware conectado**»_.

## Decisión

**Todo el sistema debe funcionar completo contra `MockProvider`.** La integración real con hardware es la **última** etapa del plan (ETAPA 15).

**Si el sistema necesita hardware para demostrarse, el desacople falló y OE-03 no se cumple.**

## Alternativas consideradas

| Alternativa                                                 | Por qué se descarta                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Integrar hardware temprano (fase 3, como sugiere §13.5)** | Acopla el diseño al fabricante justo cuando el dominio aún es maleable. El riesgo que reduce —«¿funcionará el equipo?»— se compensa dejando la verificación de modo evento como primera tarea de la ETAPA 15, con procedimiento de bloqueo si falla |
| **Desarrollo en paralelo contra hardware y Mock**           | Duplica el esfuerzo de prueba y crea la tentación de «arreglarlo en el adaptador», que es exactamente cómo se filtra el vocabulario del fabricante al dominio                                                                                       |

## Consecuencias

**Que se aceptan:**

- El proyecto **avanza sin depender de la disponibilidad del laboratorio**, que es una restricción real: la ETAPA 15 tiene precondición explícita de acceso al equipo.
- `MockProvider` no es un doble de prueba trivial: simula **latencia, fallos, reintentos, eventos duplicados y lecturas de baja confianza que no deben decidirse automáticamente** (CU-01 excepción 3a). Construirlo bien es construir la especificación del comportamiento del hardware.
- La ETAPA 15 se convierte en una **prueba de la arquitectura**, no solo en trabajo de integración: si para conectar el hardware hubiera que modificar dominio, aplicación o interfaz, sería un defecto de diseño de las etapas anteriores. Ante ese caso: **detenerse y reportar antes de tocar nada.**

**Que hay que asumir:**

- **Nueve de los 37 indicadores solo pueden cerrarse con hardware real**: KPI-13, 14, 17, 18, 22, 26, 27, 32 y 33. Hasta la ETAPA 15 se reportan como _«verificado contra simulación, pendiente de hardware»_ — **nunca como cumplidos**.
- El riesgo de que el modelo concreto no opere en modo evento se concentra al final. Se mitiga haciendo de esa verificación la **primera tarea** de la ETAPA 15, con procedimiento de hallazgo de bloqueo si el equipo decide por su cuenta.

## Verificación

1. **KPI-11:** análisis estático en CI — cero referencias a ISAPI o a IP de dispositivo fuera de `packages/providers`. Rompe el build.
2. **KPI-12:** suite completa verde con `MockProvider`, sin hardware conectado.
3. **Prueba de sustitución (LSP):** la misma suite pasa con `MockProvider` y con `HikvisionProvider` **sin cambiar una aserción**.
4. **Prueba definitiva:** al ejecutar la ETAPA 15, el diff no toca `domain/`, `application/` ni las consolas.
