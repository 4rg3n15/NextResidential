# Próxima visita (tras la 15-N) · preparación, orden y comprobaciones

> **ETAPA 15-N.** Complementa a [`VISITA-29-09.md`](VISITA-29-09.md) (los ajustes
> en el panel web de cada equipo, que siguen valiendo) y a
> [`ENTREGA_EN_SITIO.md`](ENTREGA_EN_SITIO.md) (el guion del día). Aquí va lo que
> cambió con la 15-N: qué preparar antes de salir, cómo ver el video desde otro
> equipo de la red y el orden de las comprobaciones. La lista de verificación
> equipo por equipo, con el resultado esperado de cada paso, está en el informe:
> [`ETAPA-15N.md` · Lista de verificación en sitio](../etapas/ETAPA-15N.md#lista-de-verificación-en-sitio).
>
> **Ninguna dirección, usuario ni clave va en esta guía.** Donde hace falta una
> dirección se escribe `<IP del Mac>`; la real está en su `.env` y en la ficha del
> equipo. No la copie a ningún documento.

## Índice

- [0 · Antes de salir](#0--antes-de-salir)
- [1 · Ver el video desde otro equipo de la red](#1--ver-el-video-desde-otro-equipo-de-la-red)
- [2 · Relojes](#2--relojes)
- [3 · Orden de la visita](#3--orden-de-la-visita)
- [4 · Lo que NO hay que hacer](#4--lo-que-no-hay-que-hacer)

---

## 0 · Antes de salir

1. **Rote la clave de los equipos si el 29/09 go2rtc corrió en `trace`.** Con el
   módulo `api` de go2rtc en `trace`, su registro guardó la clave de los equipos,
   sólo codificada para URL (ADR-022, enmienda 1). Cámbiela en el panel web de
   cada equipo, edite cada equipo en la consola con la clave nueva (se guarda
   cifrada en la base) y borre del Mac el registro de go2rtc de aquel día.
2. **`pnpm entorno:diff`.** Si dice `‼ SECRETO OBSOLETO: bórrelo` (hoy, con toda
   probabilidad, `SUPABASE_SECRET_KEY` en `apps/edge/.env`), quite esa línea del
   `.env`. El guion nunca imprime el valor.
3. **Dependencias y migraciones.** `pnpm install --frozen-lockfile` y aplique las
   migraciones hasta la `0046` (cola de atención y sus preferencias).
4. **`.env` de la API.** Una variable nueva, con valor por omisión:
   `GUARDIA_VIGENCIA_EN_COLA_S` (300 s en la cola de atención). Y una opcional,
   `VIDEO_REGISTRO` (por omisión `info`). `EQUIPOS_DESVIO_DE_RELOJ_S` (30) ya
   existía: ahora también decide si se da de alta a alguien en un equipo.

## 1 · Ver el video desde otro equipo de la red

La consola negocia el video con la API, pero la imagen viaja **directa** de go2rtc
(en el Mac) al navegador del operador, al candidato que go2rtc anuncia y a su
puerto WebRTC (8555, TCP y UDP). Desde el propio Mac todo funciona aunque ese
candidato no se alcance; desde el portátil de la portería, no.

1. En `apps/api/.env`, `VIDEO_IP_ANUNCIADA` = la IP del Mac **en la red del
   conjunto**. Vacía, se usa la de su Wi-Fi.
2. Arranque `pnpm sitio:video` y lea dos líneas:
   - «el medio se anuncia en `<IP del Mac>`, una dirección de este equipo». Si en
     su lugar avisa de que esa IP no es del Mac, corrija `VIDEO_IP_ANUNCIADA`.
   - «el puerto WebRTC contesta en `<IP del Mac>`:8555 (TCP)». Si dice que no
     contesta, go2rtc no escucha en esa interfaz.
3. **Cortafuegos de macOS** `[SUPUESTO]` (el nombre del menú cambia entre
   versiones): Ajustes del Sistema → Red → Cortafuegos → Opciones → **añada el
   binario de go2rtc** (la ruta la imprime `pnpm sitio:video`) y márquelo
   «Permitir conexiones entrantes». El permiso cubre TCP y UDP. Si macOS pregunta
   al arrancar go2rtc, conteste «Permitir».
4. Desde el portátil de la portería, abra la consola por la IP del Mac, vaya a la
   ficha de un equipo y abra la vista en vivo. Si la negociación termina y no
   llega imagen, el recuadro dice la causa; si dice «sin señal» con la
   negociación hecha, es el candidato o el cortafuegos del paso 3.

**No suba el registro de go2rtc a `trace` ni a `debug`.** `pnpm sitio:video` se
niega a arrancar si `api` o `rtsp` quedan en esos niveles, salvo con
`--permitir-traza`, que avisa y pide rotar la clave al terminar.

## 2 · Relojes

El 29/09 el videoportero iba unas 13 h atrasado con la zona correcta: reconocía
la cara y negaba con «permiso vencido». Ahora la plataforma **lee la hora del
equipo antes de dar de alta a alguien con vigencia** y, si se desvía más de
`EQUIPOS_DESVIO_DE_RELOJ_S`, no escribe nada y la visita lo dice junto al nombre
del equipo.

- Ponga NTP (o «sincronizar con el PC») en los tres equipos y compruebe en la
  ficha que la fila «reloj» queda dentro de la tolerancia.
- `pnpm sitio:ensayo --restaurar` **nunca** restaura zona ni hora: la hora se
  fija con NTP. Si el respaldo trae una zona distinta de la del conjunto, avisa.

## 3 · Orden de la visita

1. Preparación (§0) y video en la red (§1).
2. `pnpm sitio:ensayo` con los tres equipos. El paso 3 ya no marca FALLO al
   videoportero por no declarar `setUp` ni `visitor`: escribe la forma de alta que
   se usará. Anote esa línea de cada equipo en la hoja.
3. La lista del informe, **en este orden**: cámara, terminal, videoportero,
   plataforma. La cámara va primero porque es la ruta verificada con hardware:
   si algo de ella no se comporta como el 28/09, pare y repórtelo antes de seguir.
4. Guardia virtual abierta en un segundo equipo durante toda la visita: cada
   rostro rechazado, placa no autorizada o llamada debe abrir sola la «Atención»
   con el video de ESE equipo.

## 4 · Lo que NO hay que hacer

- No escriba direcciones, usuarios ni claves en la hoja de resultados: la
  plataforma los tacha en sus informes, y la hoja no debe tenerlos.
- No cambie la hora de un equipo a mano para «probar» el aviso de reloj sin que
  el cliente lo autorice; si lo hace, vuelva a poner NTP antes de irse.
- No reintente una clave rechazada: cada intento acerca el bloqueo de la cuenta
  en el equipo.
