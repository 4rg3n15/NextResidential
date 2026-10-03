# Aceptaciones de riesgo

> **Ronda 15-R · F1.** Registro único de los riesgos que el proyecto **no
> elimina** y que alguien con autoridad debe aceptar —o rechazar— por escrito.
> Sustituye a la §7 de [`AUDITORIA.md`](AUDITORIA.md), que desde esta ronda
> remite aquí. Nada de lo que sigue está firmado: el agente redacta, **firma
> quien responde por el riesgo**. Rechazar una aceptación no es un problema:
> reabre el hallazgo y obliga a planificar su corrección, que es justo lo que se
> quiere saber.

Cada entrada dice **qué** se acepta, **por qué**, **qué lo acota** y **qué lo
reabre**. Las cerradas se conservan con su motivo, para que nadie busque en
otro sitio por qué ya no están abiertas.

| Id      | Riesgo                                                          | Estado                                                         | Firma                   |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------- |
| AR-01   | Contraseña inerte de un doble de pruebas en el historial de Git | **Redactada · pendiente de firma**                             | Dirección de proyecto   |
| AR-02   | 12 vulnerabilidades moderadas y bajas en producción             | **CERRADA** (15-U): se corrigieron, no se aceptan              | —                       |
| AR-03   | Inmutabilidad y rol dedicado demostrados en un clúster local    | **Redactada · pendiente de verificación en su proyecto**       | TI de Grupo Control     |
| AR-04   | Ciclo de recuperación de contraseña por correo no verificable   | **CERRADA** (15-R, E8): desactivado en producción, no aceptado | —                       |
| AR-05   | Clave de un equipo expuesta en la visita del 29/09, no rotable  | **Redactada · pendiente de firma**                             | **TI de Grupo Control** |
| H-15B-1 | Credenciales de equipo cifradas en la base (riesgo residual)    | **Redactada · pendiente de firma** · acotada por el Edge       | TI de Grupo Control     |

---

## AR-01 · La contraseña inerte en el historial de Git (H-13-25)

**Qué se acepta.** Que el blob `459332bc…` (y su gemelo `7062bfa7…`), con la
línea `contrasena: 'Contrasena-De-Prueba-1'` de `e2e/doble-gotrue.mjs`,
permanezca en el historial del repositorio sin reescribirlo.

**Por qué.** El valor es la contraseña de un doble de GoTrue que se levanta
dentro del proceso de prueba y nunca fue credencial de un servicio real; el
árbol ya no la contiene desde `f06050e`; y reescribir el historial invalidaría
las referencias y los SHA citados en todos los informes de etapa a cambio de
retirar un valor inerte.

**Qué lo acota.** Su declaración como línea base en
`scripts/lib/escanear-secretos.mjs`, con nombre y motivo: el escaneo de
historial parte de cero y cualquier hallazgo futuro es real.

**Qué lo reabre.** Que ese valor se haya reutilizado en alguna cuenta real, o
que el repositorio pase a ser público.

Firmado por: ……………………… · Cargo: ……………………… · Fecha: ………………………

---

## AR-02 · Las 12 vulnerabilidades moderadas y bajas en producción (H-13-26) · **CERRADA** · 2026-10-03

**No se firma: se corrigió.** Proponía aceptar 12 vulnerabilidades «sin versión
corregida publicada». El cliente no la aceptó, y al volver a medir las 12
tenían corrección. La ronda 15-U (`docs/etapas/ETAPA-15U.md`) sube NestJS a la
11 y Express a la 5: `pnpm audit --prod` pasa de **12** a **0** sin tocar una
aserción. Lo que queda es el árbol de **desarrollo** (DT-15U-01), que no viaja a
producción.

---

## AR-03 · D-09 y D-12 demostrados en un clúster que reproduce Supabase, no en Supabase

**Estado de esta ronda.** El encargo pedía **verificarla contra el proyecto
real** con las aserciones de despliegue de `0017` y `0031`, y cerrarla si
pasaban. **No se pudo**: este entorno no tiene credenciales del proyecto de
Grupo Control [Cierto] —ni `.env`, ni `DATABASE_URL`, ni llaves—, y es
deliberado (§2.7.1). Queda redactada, y su cierre está a un comando de usted.

**Qué se acepta, mientras tanto.** Que la inmutabilidad frente al dueño (D-09)
y la concesión de `authenticated` al rol de conexión dedicado (D-12) estén
demostradas por ejecución contra el clúster local en **modo Supabase** —dueño
`sb_postgres_sim`, **no** superusuario— y no contra el proyecto real.

**Por qué.** El modo reproduce la condición que hace la diferencia: el dueño no
es superusuario, así que el `REVOKE` y la RLS forzada le alcanzan. Entregar
credenciales del proyecto real a un entorno de desarrollo sería un riesgo mayor
que el que cierra.

**Qué lo acota.** Las aserciones de despliegue: `0017` falla si alguna tabla
append-only conserva `UPDATE`/`DELETE`/`TRUNCATE` (dueño incluido), si falta o
está desactivado un trigger, o si `app_api` existe con escritura sobre ellas;
`0031` falla si la RLS no está **forzada** en las append-only.

**Cómo la cierra usted** (con el proyecto enlazado, `CONEXION_SUPABASE.md` §4):

1. `supabase db push`. Las aserciones corren dentro de las migraciones: si una
   capa falta, el despliegue **falla** con `ADR-005 incumplido: …` y no se
   aplica nada más. Que termine sin error ya es la primera prueba.
2. Las tres consultas de `CONEXION_SUPABASE.md` §12.5: las dos primeras deben
   devolver **0 filas**; el `UPDATE` de la tercera, sobre un evento **real**,
   debe **fallar**.
3. Anote abajo la fecha, el identificador del proyecto (no las llaves) y el
   resultado. Con los tres puntos en verde, **AR-03 pasa a CERRADA** y no hace
   falta firmar la aceptación.

**Qué la reabre.** Un `supabase db push` que falle en `0017` o `0031`, o una
de las consultas de §12.5 con filas.

Verificado en el proyecto: ……………………… · Fecha: ……………………… ·
Resultado: ………………………

Firmado por (sólo si no se verifica): ……………………… · Cargo: ………………………
· Fecha: ………………………

---

## AR-04 · Recuperación de contraseña por correo, no verificable (BE-01) · **CERRADA** · 2026-10-03

**No se acepta: se desactivó.** Proponía aceptar que el ciclo por correo
—envío, enlace, redirección— quedara como «no verificable de punta a punta»,
porque el SMTP y las URLs de redirección viven en el panel de Supabase. El
cliente decidió (ronda 15-R, AR-04) que **en producción la recuperación por
correo está DESACTIVADA** y que la contraseña la restablece una persona.

Lo hecho (15-R, E8): con `RECUPERACION_POR_CORREO` sin definir, la consola en
producción **no ofrece** el enlace y sus rutas responden con un mensaje que
remite al administrador. El restablecimiento lo hace una persona: un
administrador emite una contraseña temporal
(`POST /copropiedades/:id/usuarios/:usuarioId/restablecimiento`), con constancia
`restablecimiento_contrasena` en `auditoria_seguridad`
(`docs/guias/RECUPERACION_Y_USUARIOS.md`). Un riesgo que no existe no se acepta.

**Qué la reabre.** Poner `RECUPERACION_POR_CORREO=activa` en producción. Antes de
hacerlo hay que verificar el ciclo completo en el panel —SMTP propio y URLs de
redirección— y volver a redactar esta entrada.

---

## AR-05 · La clave de un equipo expuesta en la visita del 29/09, que no se puede rotar

**Qué pasó.** En la visita del 29/09 el go2rtc del portátil pudo correr con el
registro en `trace`, y en ese nivel go2rtc escribe la URL RTSP **con la clave
del equipo** (DT-15N-05, ADR-022 enmienda 1). La ronda 15-N impidió que vuelva a
ocurrir (`sitio:video` no arranca go2rtc con ese nivel) y pidió rotar la clave
(`ETAPA-15N.md` §9, paso 1). **El cliente informa que esa clave no se puede
rotar.** [Suposición] La causa es operativa —el equipo o su contrato de
mantenimiento—, no técnica; el registro no dice cuál.

**Qué se acepta.** Que la clave de ese equipo siga en uso después de haber
quedado, posiblemente, escrita en un registro fuera del sistema.

**Por qué.** No rotarla es una restricción del cliente, no una decisión de
diseño. Lo que el proyecto sí controla es **dónde vale** esa clave y **quién
puede llegar** al equipo para usarla.

**Qué lo acota** — cuatro capas, de las que las dos últimas son de la red del
conjunto y no del código:

1. **La credencial sólo vive en el Edge** (ADR-035, 15-Q2 D). Con el Edge como
   puente, la clave se cifra en la máquina del conjunto con
   `EDGE_EQUIPOS_LLAVE` y **la nube no la guarda**: queda una huella que dice si
   cambió, nunca cuál es (`DESPLIEGUE_EDGE.md` §10.4–§10.5).
2. **Un usuario de servicio por equipo**, con el mínimo privilegio de su
   función (abrir, plantillas, audio) y **no** el de fábrica. Si la clave
   expuesta es la del administrador del equipo, la medida es dejar de usarla
   para el sistema y que el sistema use su propio usuario.
3. **Filtro de IP en el equipo**: sólo la IP del Edge puede autenticarse.
   [Probable] Los equipos Hikvision lo ofrecen como lista de direcciones
   permitidas (Configuración → Sistema → Seguridad → Filtro de dirección IP);
   el nombre exacto depende del modelo y del firmware.
4. **VLAN de equipos**: cámaras, terminal y videoportero en una red que sólo el
   Edge alcanza. Con 3 y 4, quien tenga la clave **no tiene desde dónde usarla**.

**Qué lo reabre.** Que el equipo quede alcanzable fuera de la VLAN o sin filtro
de IP; que se detecte un acceso al equipo desde una IP que no sea la del Edge;
o que la clave pase a ser rotable —entonces se rota y esta entrada se cierra.

Firmado por (TI de Grupo Control): ……………………… · Cargo: ……………………… ·
Fecha: ………………………

---

## H-15B-1 · Riesgo residual de guardar credenciales de equipo cifradas en la base

**Qué es.** Desde la 15-B, la clave de cada equipo dado de alta en **modo
directo** se guarda en la base, cifrada en la aplicación (AES-256-GCM, llave
derivada por copropiedad de `EQUIPOS_LLAVE`). Hallazgo completo y mitigaciones
en `AUDITORIA.md` §3, H-15B-1.

**Qué se acepta.** Que quien comprometa **a la vez** la base y la variable
`EQUIPOS_LLAVE` del proceso obtenga las claves de los equipos **de las
copropiedades sin Edge puente**.

**A quién aplica, desde la 15-Q2.** Con el Edge como puente (ADR-035), las
claves salen de la nube (`DESPLIEGUE_EDGE.md` §10.5: la nube borra los bytes y
conserva la fila como historial). Para esas copropiedades **el riesgo no
existe**: la base no tiene nada que entregar. Queda sólo para las que operan en
modo directo —sin Edge, o con el puente quitado (§10.6)—.

**Por qué.** Una variable de entorno por equipo no escala a multiempresa, y
comprometer base **y** proceso equivale a comprometer el servidor, desde donde
ya se puede pedir al sistema que abra la barrera. La defensa de ese escenario no
es criptográfica: es el privilegio mínimo del usuario de servicio del equipo y
la auditoría.

**Qué lo acota.**

- Cifrado en la aplicación, llave por copropiedad y por propósito, etiqueta de
  integridad, ningún token de usuario lee la tabla, la API nunca devuelve el
  secreto (mitigaciones 1–6 de H-15B-1).
- **Rotación de la llave maestra con recifrado** (15-R, F2,
  `CONEXION_SUPABASE.md` §13): tras rotar y destruir la anterior, ningún
  respaldo previo abre una credencial. Antes de esta ronda, un respaldo filtrado
  quedaba abierto para siempre a quien tuviera la llave de ese día.
- El Edge puente, que elimina el riesgo donde se despliega.

**Qué lo reabre.** Un conjunto en modo directo con más de un año sin rotar la
llave maestra, o un volcado de la base con indicios de haber salido del
proyecto: en ese caso, rotar (§13) y, si además pudo salir la llave, cambiar la
clave **en los equipos** (H-15B-1, pasos 1–2).

Firmado por (TI de Grupo Control): ……………………… · Cargo: ……………………… ·
Fecha: ………………………
