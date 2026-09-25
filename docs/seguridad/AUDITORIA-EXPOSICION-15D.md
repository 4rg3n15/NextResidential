# Auditoría de exposición · ETAPA 15-D (§7.2 del enunciado)

**Fecha:** 2026-09-24 · **Rama:** `etapa-15d-integracion-extensible` · **Ejecutor:** el agente, en el contenedor de desarrollo

> **Alcance.** Todo el repositorio en su estado actual **y todo el historial de
> Git alcanzable desde todas las referencias**: IPs privadas, usuarios,
> contraseñas, tokens, credenciales, secretos, URLs y endpoints internos.
> **Veredicto: ningún secreto ni dirección real en el árbol ni en el historial.**
> Todo lo que apareció es dato de prueba, documentación de mockups o sondas
> deliberadas de los propios controles, y se lista abajo con su clasificación.

## 1 · Qué se ejecutó

| Barrido                                                                                                                                                                               | Herramienta                                                                | Resultado                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Secretos en el historial (patrones de llaves, JWT, claves privadas, `sb_secret_`…)                                                                                                    | `node scripts/lib/escanear-secretos.mjs --historial`                       | **limpio** · 2911 blobs del historial alcanzable · 2 de línea base declarados |
| Secretos en el índice (lo que se confirma)                                                                                                                                            | gancho de pre-commit (`--indice`), en cada commit de la etapa              | **limpio** · 1413 → 1423 archivos                                             |
| IPs de rango privado, URLs internas (`.local`, `.lan`, `.internal`), contraseñas literales, JWT, `AKIA`, claves PEM, en **líneas añadidas de todo el historial** (`git log -p --all`) | expresión regular propia, excluyendo `pnpm-lock.yaml` y clientes generados | **36 líneas**, todas clasificadas en §2 · ninguna real                        |
| IPs de rango privado en el árbol actual (`git grep`)                                                                                                                                  | expresión regular propia                                                   | **10 líneas**, clasificadas en §3 · ninguna real                              |
| KPI-11 (ISAPI y direcciones de equipo fuera de `packages/providers`)                                                                                                                  | `node scripts/lib/frontera-hardware.mjs`                                   | **sin fugas**                                                                 |

## 2 · Las 36 líneas del historial, clasificadas

| Clase                                                                | Ejemplos                                                                                                                         | Veredicto                                                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datos de prueba con IP privada en ficheros de prueba, ya sustituidos | `host: '10.0.0.5'`, `'10.20.30.40'`, `'10.0.0.9'` en pruebas de tablero, equipos y barrera                                       | **No es dato real**: rangos reservados, sin equipo detrás. Hoy sólo queda `10.0.0.9` en una prueba de `packages/providers` (zona permitida por KPI-11) |
| Alias del emulador Android                                           | `API_BASE_URL=http://10.0.2.2:3000` en `apps/mobile/.env.example`                                                                | Convención del emulador para «la máquina anfitriona»; no es una red del cliente                                                                        |
| Orígenes de prueba bajo `.local`                                     | `consola.de.pruebas.local`, `evidencia.local`, `firmada.local`                                                                   | Dominios de prueba de los adaptadores en memoria; no resuelven                                                                                         |
| Contraseña del doble de autenticación de la app móvil                | `contrasena: 'Contrasena-De-Prueba-1'` en `e2e/doble-gotrue.mjs`                                                                 | Doble de GoTrue para pruebas; no existe cuenta con ella                                                                                                |
| JWT de prueba                                                        | `eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0.eyJzdWIiOiIxIn0.firma`                                                                      | Cabecera y cuerpo literales con firma `firma`: no es un token                                                                                          |
| Ejemplos del propio escáner de secretos                              | el prefijo de llave secreta de Supabase seguido del marcador `STAGEDONLY` (así lo escribe la propia prueba negativa del escáner) | Marcador de la prueba negativa del escáner, declarado en su línea base                                                                                 |
| Sondas de las pruebas negativas de KPI-11                            | `http://192.168.1.64/…` escrito y borrado por `pruebas-negativas.mjs`                                                            | Existe para que el control lo detecte; lleva `kpi-11-exento` en su línea                                                                               |
| Documentación de los mockups                                         | `192.168.1.101` citado en `03-mockups.md` y en C-11                                                                              | Cita del mockup W-07, que la 15-D deja de atender en ese punto (C-28)                                                                                  |

## 3 · Lo que queda en el árbol, y por qué se queda

| Fichero                                                | Línea                           | Por qué no es exposición                                                           |
| ------------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/mobile/.env.example`                             | `10.0.2.2`                      | Alias del emulador; el ejemplo lo explica                                          |
| `apps/web/src/lib/limitador.test.ts`                   | `10.0.0.1` en `X-Forwarded-For` | Prueba del limitador con `kpi-11-exento`; es un cliente ficticio, no un equipo     |
| `packages/providers/src/barrera/desde-entorno.test.ts` | `10.0.0.9`                      | Dentro de `packages/providers`, la única zona donde KPI-11 admite direccionamiento |
| `scripts/lib/pruebas-negativas.mjs`                    | `192.168.1.64`                  | Sonda que el control debe detectar; se escribe y se borra en la propia prueba      |
| `docs/…`                                               | `192.168.1.101`, `192.168.1.22` | Citas de mockups y de una guía de verificación del propio usuario; no son equipos  |

## 4 · Lo que la 15-D cambió para que la exposición no vuelva

- **Ninguna respuesta de la API lleva `host`, `puerto`, `protocolo` ni `usuario`
  de un equipo** para ningún rol (C-28 revoca C-11). La consola no tiene dónde
  pintarlos. Pruebas: `equipos.e2e.test.ts`, `tablero.e2e.test.ts`,
  `pantallas-render.test.tsx`.
- El detalle de «inalcanzable» **elide** la dirección (`20…10:80`).
- La edición de un equipo es parcial: lo que el cliente no vio no se le pide
  que lo reenvíe.
- Las credenciales de equipo siguen cifradas en `credenciales_de_equipo` bajo
  `EQUIPOS_LLAVE`, sin política de lectura para tokens de usuario (15-B), y
  ahora se usan también para sondear en el servidor sin que nadie las reescriba.
- El informe del guion de sitio sigue elidiendo host y usuario, y su modo
  `--simulado` usa nombres bajo `.invalid`.

## 5 · Lo que esta auditoría NO cubre

- **Los entornos desplegados** (variables reales en Supabase, en el servidor de
  la API, en los `.env` locales del usuario): fuera del repositorio, fuera del
  alcance.
- **La red del conjunto**: la VLAN de equipos es el endurecimiento real de
  H-15-1 y no se puede verificar desde aquí.
- **Los `.env` que el usuario tenga en su máquina** (D8/D9 del enunciado): no
  están en el repositorio y no deben estarlo.
