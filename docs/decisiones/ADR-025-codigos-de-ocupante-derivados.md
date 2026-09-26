# ADR-025 · Los códigos de ocupante se DERIVAN bajo demanda; no se guardan

|                 |                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Estado**      | Aceptada · ETAPA 15-I (2026-09-26) · decisión del cliente **D6**                                                                                       |
| **Sustituye a** | Nada                                                                                                                                                   |
| **Afecta a**    | migración `0038` (`plazas_de_ocupante`), `apps/api/src/residente/infraestructura/codigos-de-ocupante.ts`, `PROPOSITOS.codigoDeOcupante`, app y consola |

---

## Contexto

D6: el primer residente declara UNA vez cuántas personas viven en la vivienda.
Cada ocupante recibe un **código único** con el que vincula su propia cuenta.
El código sirve para contar ocupantes y para impedir que alguien de otra
vivienda se declare conviviente. Tiene que poder **consultarse siempre** desde
el perfil de la app y desde la consola del superadministrador. Es de **un solo
uso**, con límite de intentos y auditoría. El encargo dejaba dos opciones:
guardarlos cifrados con una llave de entorno nueva, o regenerarlos bajo demanda.

## Decisión

**Se regeneran bajo demanda.** Cada plaza (`plazas_de_ocupante`) guarda
`numero`, `generacion`, `usuario_id` y `usada_en`, y **ningún código**. El
código es:

```
HMAC-SHA256( HKDF(BIOMETRIA_LLAVE, copropiedad, 'ncr:codigo-de-ocupante:v1'),
             '<plazaId>:<generacion>' )[0..5]  →  8 caracteres de
             ABCDEFGHJKLMNPQRSTUVWXYZ23456789  (40 bits, «ABCD-EFGH»)
```

- **Consultable siempre**: se recalcula en cada lectura (perfil y consola).
- **Un solo uso**: la plaza tomada tiene `usuario_id`; su código ya no se
  muestra ni se acepta. Si la plaza se libera, `generacion` sube y el código
  anterior deja de valer.
- **Comparación**: recorre TODAS las plazas libres y compara en tiempo constante
  (`timingSafeEqual`). La respuesta no revela cuántas hay ni cuál casi coincidía.
- **Límite de intentos**: 5 códigos incorrectos en 15 minutos por cuenta
  (`INTENTOS_DE_VINCULACION`, S-55). Cada fallo y cada bloqueo quedan en
  `bitacora_de_residentes`, que es de solo inserción.

## Alternativas consideradas

| Alternativa                                   | Por qué no                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardar el código cifrado con una llave nueva | Una variable más que aprovisionar y rotar. Una copia de la base con la llave filtrada trae todos los códigos libres. No aporta nada que la derivación no dé ya |
| Guardar un hash del código                    | No se podría consultar después: el requisito es que el residente lo vea siempre                                                                                |
| Código aleatorio en claro en la tabla         | Cualquiera con lectura de la tabla (RLS aparte, la llave secreta la omite) se vincula a cualquier vivienda                                                     |

## Consecuencias

- **Sin variable nueva en `.env.example`.** La llave sale de `BIOMETRIA_LLAVE`
  con su propio propósito HKDF, igual que el código de patrullaje (S-48). Los
  propósitos distintos garantizan que un código no sirva para otra cosa.
- **Rotar `BIOMETRIA_LLAVE` cambia los códigos libres.** Los ya usados no se ven
  afectados, porque no se vuelven a usar. Esto se anota en el procedimiento de
  rotación de llaves.
- 40 bits frente a 5 intentos cada 15 minutos por cuenta. El límite por IP de
  `mi/alta` (30/min) acota además el ataque repartido entre cuentas.

## Verificación

- `apps/api/test/residentes-y-vehiculos-pg.test.ts`: un código correcto vincula;
  los incorrectos se cuentan y bloquean; una plaza usada no vuelve a valer.
- `supabase/policies/tests/90_residentes_y_vehiculos_propios.sql`: sólo el
  superadministrador añade o retira plazas (`tg_plazas_solo_superadministrador`).
- `packages/domain-core/src/residente/residentes-15i.test.ts`: formato,
  normalización y alfabeto sin caracteres ambiguos.

## Contingencia

Si el cliente pidiera códigos que sobrevivan a una rotación de la llave
maestra, se añadiría un propósito versionado (`…:v2`) y se aceptarían las dos
versiones durante una ventana. No cambia la tabla.
