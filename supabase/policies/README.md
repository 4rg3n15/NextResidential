# Políticas RLS · matriz y suite de verificación

**Dónde vive el SQL ejecutable.** En `supabase/migrations/20260906121300_0014_rls_politicas.sql`.
Las políticas son parte del esquema y se versionan con él: tener una copia
aparte produciría dos verdades y una de las dos envejecería. Este directorio
contiene **la matriz revisable** y **la suite que la comprueba**.

---

## 1. Predicados de alcance

Todos derivan de los *claims* del JWT. **Nunca de un parámetro que el cliente
pueda elegir** (contradicción C-05: el selector «TIPO DE USUARIO» del mockup se
elimina justamente por esto).

| Código | Función | Predicado |
|---|---|---|
| **T** | `app.es_mi_copropiedad(id)` | `id = claim copropiedad_id` |
| **M** | `app.es_copropiedad_atendida(id)` | `id ∈ claim copropiedades[]` — operador de central, HU-25, KPI-35 |
| **V** | `app.es_mi_vivienda(id)` | El residente autenticado pertenece a esa vivienda — RN-05 |
| **P** | `app.es_superadmin()` | Rol de plataforma, sin filtro de tenant |
| **S** | `app.es_servicio(id)` | Identidad de servicio con alcance T |

`app.es_mi_vivienda` es la **única** función `SECURITY DEFINER` del esquema. Su
justificación —recursión de RLS y obsolescencia del token— está escrita en la
cabecera de la migración `0003` y repetida en `0005`, donde se define.

En Supabase, `auth.jwt()` es exactamente
`current_setting('request.jwt.claims', true)::jsonb`. Se usa la forma larga para
que el esquema y su suite corran igual sobre una base PostgreSQL vacía.

---

## 2. Matriz

Operaciones: `R` SELECT · `I` INSERT · `U` UPDATE.
**`DELETE` no se concede a ningún rol en ninguna tabla** (RN-19, decisión D-20).

| Tabla | Superadmin | Administrador | Portero | Operador central | Residente | Servicio |
|---|---|---|---|---|---|---|
| `copropiedades` | R I U ᴾ | R U ᵀ | R ᵀ | R ᴹ | R ᵀ | R ˢ |
| `usuarios` | R I U ᴾ | R I U ᵀ | — | — | R (propia) | — |
| `roles_usuario` | R I U ᴾ | R I U ᵀ | — | — | R (propia) | — |
| `personas` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R ⱽ | R ˢ |
| `viviendas` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R ⱽ | R ˢ |
| `niveles_acceso` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | — | R ˢ |
| `residentes` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R ⱽ | R ˢ |
| `vehiculos` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | **R I U ⱽ** | R ˢ |
| `visitantes` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R ⱽ | R ˢ |
| `listas_negras` | R ᴾ | **R I U ᵀ** | R ᵀ | **R I U ᴹ** | — | R ˢ |
| `autorizaciones` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | **R I U ⱽ** | R ˢ |
| `patrones_recurrencia` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R I ⱽ | R ˢ |
| `autorizacion_acompanantes` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R I ⱽ | R ˢ |
| `autorizaciones_zona` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R I ⱽ | R ˢ |
| `zonas` | R ᴾ | R I U ᵀ | R ᵀ | R **U** ᴹ ¹ | R ᵀ | R ˢ |
| `zona_horarios` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R ᵀ | R ˢ |
| `zona_aforo` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | R ᵀ | **R U ˢ** ² |
| `consentimientos_biometricos` | R ᴾ | R I U ᵀ | — | — | R ᵀ ³ | R I U ˢ |
| `plantillas_biometricas` | R ᴾ ⁴ | R ᵀ ⁴ | — | — | — | R I U ˢ ⁴ |
| `plantilla_sincronizaciones` | R ᴾ | R ᵀ | — | — | — | R I U ˢ |
| `dispositivos` | R I U ᴾ | R I U ᵀ | — ⁵ | — ⁵ | — | R U ˢ |
| `puntos_de_acceso` | R ᴾ | R I U ᵀ | R ᵀ | R ᴹ | — | R ˢ |
| `edge_gateways` | R I U ᴾ | R ᵀ | — | — | — | R U ˢ |
| `versiones_de_reglas` | R ᴾ | R I ᵀ | R ᵀ | R ᴹ | — | R ˢ |
| `reglas` | R ᴾ | R I ᵀ | R ᵀ | R ᴹ | — | R ˢ |
| `eventos` | R ᴾ | R ᵀ | **R I ᵀ** | **R I ᴹ** | **R ⱽ** | **R I ˢ** |
| `evidencias` | R ᴾ | R ᵀ | R I ᵀ | R I ᴹ | R ᵀ | R I ˢ |
| `alertas` | R ᴾ | R U ᵀ | R U ᵀ | R U ᴹ | — | R I ˢ |
| `auditoria_seguridad` | **R ᴾ** | R ᵀ ⁶ | — | — | — | I |
| `bandeja_salida_edge` | R ᴾ | R ᵀ | — | — | — | R I U ˢ |
| `purgas_retencion` | R ᴾ | R ᵀ | — | — | — | **I ˢ** ⁷ |

**Notas**

1. El operador de central puede **cerrar** una zona (`abierta = false`), que es
   la capacidad que resuelve **PB-04**. No puede crearla ni reconfigurarla.
2. Solo el servicio mueve `conteo_actual`, mediante la actualización condicional
   atómica de la decisión D-04.
3. El residente ve el **estado** del consentimiento de sus visitantes —para
   saber si el acceso facial quedó habilitado—, nunca la evidencia ni el vector.
4. **Nadie lee `vector_cifrado`.** La columna queda fuera de toda vista y su
   lectura se reserva al proceso de sincronización, que la descifra con la llave
   de bóveda y no la persiste en ningún otro sitio.
5. Portero y operador **no leen la tabla base**: usan la vista
   `dispositivos_operativos`, que no expone `host` ni `credencial_ref`
   (contradicción C-11).
6. El administrador ve los intentos **contra** su copropiedad
   (`copropiedad_id_objetivo`), no los que salieron de ella hacia otras: esos son
   del superadministrador, porque revelan actividad de un tenant a otro (D-14).
7. `purgas_retencion` es **append-only**, como `eventos`, `evidencias` y
   `auditoria_seguridad`: solo `INSERT`, y ni siquiera el rol de mantenimiento
   conserva `UPDATE` o `DELETE` (D-21).

---

## 3. El agujero conocido: `service_role`

**La clave `service_role` de Supabase omite RLS por completo.** Toda la matriz
anterior es papel mojado en cualquier ruta que la use, y hay tres que la usan
por diseño: la ingesta de eventos, los trabajos de pg-boss y el Edge Gateway.

`CLAUDE.md` §2.7.6 lo llama el riesgo de seguridad número uno del proyecto.
La contención tiene tres capas, y esta etapa entrega la primera:

1. **Estructural.** Las restricciones y `CHECK` no dependen de RLS: se aplican
   también a `service_role`. Y los `REVOKE UPDATE, DELETE` sobre `eventos`
   **tampoco** se eluden con esa clave, porque son permisos de tabla, no
   políticas de fila. Es exactamente la razón por la que ADR-005 usa `REVOKE`.
2. **Aplicación** (ETAPA 03). Toda ruta con `service_role` valida
   `copropiedad_id` explícitamente en el caso de uso.
3. **Verificación** (ETAPAS 03 y 13). La suite recorre todos los endpoints por
   los dos caminos y rompe el build ante cualquier fuga.

---

## 4. Suite de verificación

```
./supabase/verificar.sh --con-pruebas
```

| Archivo | Qué prueba |
|---|---|
| `tests/00_aislamiento_multiempresa.sql` | Positiva y negativa por tabla · RN-15, CA-24, KPI-36 · alcance del operador multiproyecto (KPI-35) · alcance del residente (RN-05, RN-21) |
| `tests/10_invariantes_estructurales.sql` | RN-04/CA-03, D-05, normalización, RN-14/CA-14, CA-16/CA-17, errores tipados, **D-18**, RN-09/CA-09, RN-05, RN-13, RN-19/CA-02, RN-17/CA-22, RN-21/D-09b, RN-16, P-11 |
| `tests/20_inmutabilidad_eventos.sql` | ADR-005/CA-23 con **los seis roles** · partición recién creada · D-12 |
| `tests/30_concurrencia_placas.sh` | **KPI-03**: 100 inserciones concurrentes reales, 0 duplicados |

Las pruebas de aislamiento se ejecutan como el rol `authenticated`, **no** como
superusuario: un superusuario omite RLS y la suite no probaría nada. Las de
invariantes se ejecutan a propósito **como superusuario**, para demostrar que se
cumplen aunque el actor omita RLS por completo — que es la situación de
`service_role`.
