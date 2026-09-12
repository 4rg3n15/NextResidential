# Bloque 5 · La cuenta con el segundo factor a medias

> **Propuesta escrita. No se ha construido nada.**

---

## 1. Qué pasa exactamente hoy

La inscripción del segundo factor tiene **dos pasos separados por una persona**:
la API pide a Supabase Auth que cree un factor —que nace en estado `unverified`—
y muestra el QR; el usuario lo escanea y envía un código; ese código verifica el
factor y lo pasa a `verified`.

Entre los dos pasos hay una ventana en la que el factor **existe y no sirve**. Se
entra en ella al cerrar la pestaña, agotar la batería, escanear el QR con la
aplicación equivocada, o simplemente al no terminar. El estado resultante:

- El guard exige `aal2` y la cuenta no puede alcanzarlo → **no entra**.
- La inscripción no puede repetirse limpiamente, porque ya hay un factor colgado.
- La consola ofrece un QR nuevo, pero el factor viejo sigue ahí ocupando sitio.

La cookie `ncr_factor` que marca el factor pendiente vive **10 minutos**, así que
pasado ese plazo la consola ni siquiera recuerda cuál era.

**La salida actual es el panel de Supabase**, y su objeción es correcta: eso no
es un procedimiento, es una dependencia de que alguien con acceso al panel esté
disponible.

---

## 2. Por qué ocurre, dicho con precisión

No es un defecto de nuestro código: es **cómo funciona la inscripción TOTP**, en
Supabase y en cualquier otro proveedor. El factor tiene que existir antes de que
el usuario pueda probarlo, porque el secreto del QR **es** el factor.

Lo que sí es nuestro es la ausencia de una salida. Se construyó el camino feliz
y no el de quien lo abandona a la mitad, que es el patrón que esta ronda viene
persiguiendo: el hueco no está en lo que falla, está en lo que nadie recorrió.

---

## 3. Propuesta

### 3.1 Barrido de factores sin verificar — la pieza principal

Al empezar una inscripción, la API **retira los factores `unverified` del usuario**
antes de crear el nuevo. Un factor sin verificar no protege nada y no tiene por
qué sobrevivir a un segundo intento.

Es la corrección que más cierra el problema y la más pequeña: el usuario
atascado vuelve a la pantalla de inscripción y sale solo, sin que nadie
intervenga. Deja constancia en `auditoria_seguridad`.

**Peso: 0,5 jornadas.**

### 3.2 Caducidad del factor a medias

Un factor `unverified` con más de **30 minutos** se considera abandonado y se
retira en el siguiente intento del usuario, sin esperar a que él lo pida. No hace
falta un trabajo programado: basta comprobarlo cuando el usuario vuelve, que es
el único momento en que importa.

Se alinea con la cookie `ncr_factor` de 10 minutos, que es más corta a propósito:
la cookie sólo recuerda el QR en curso; los 30 minutos son la vida del factor.

**Peso: 0,25 jornadas.**

### 3.3 Que la consola lo diga

Hoy quien cae en esa ventana ve la pantalla de segundo factor sin explicación.
Debería ver: _«Tu inscripción del segundo factor quedó a medias. Empieza de
nuevo: el intento anterior se descarta.»_ y un botón que reinicia.

Sin este mensaje, el arreglo de §3.1 funciona pero el usuario no sabe que puede
intentarlo otra vez — y volvería a pedir el panel.

**Peso: 0,25 jornadas.**

### 3.4 Salida del superadministrador, para lo que §3.1 no alcanza

§3.1 resuelve el caso en que el usuario **puede volver a intentarlo**. No
resuelve el caso en que perdió el teléfono con el factor ya verificado y gastó
sus diez códigos.

Para eso, **«Retirar segundo factor» en la pantalla de usuarios del bloque 4**,
sólo superadministrador, con confirmación con motivo obligatorio —la misma
fricción que el contrato exige a la apertura manual (RN-08)— y registro en
`auditoria_seguridad` con actor, objetivo y motivo.

La cuenta vuelve a `aal1`, no puede entrar a ninguna pantalla administrativa —los
guards siguen exigiendo `aal2`— y lo único que puede hacer es inscribir un factor
nuevo. **No es una puerta trasera: es un botón que obliga a volver a inscribirse.**

**Depende de la pantalla del bloque 4.** Si esa pantalla se difiere, esto se
difiere con ella. **Peso: 0,5 jornadas** sobre la pantalla ya construida.

---

## 4. Lo que NO propongo, y por qué

- **Un endpoint que retire el factor sin superadministrador.** Sería un camino
  para quitarse el segundo factor a uno mismo, y eso es exactamente lo que RN-20
  impide.
- **Un trabajo programado que barra factores sin verificar.** Añade una pieza
  móvil para un problema que se resuelve cuando el usuario vuelve, que es el
  único instante en que el factor colgado estorba.
- **Bajar el `aal2` exigido durante la inscripción.** Es la tentación obvia y es
  la que rompe CA-25.

---

## 5. Recomendación

| Pieza                                         | Peso   | Cuándo                                                        |
| --------------------------------------------- | ------ | ------------------------------------------------------------- |
| §3.1 barrido de `unverified`                  | 0,5 j  | **Ahora.** Resuelve el 90 % de los casos y no depende de nada |
| §3.2 caducidad a los 30 min                   | 0,25 j | **Ahora.** Va en el mismo sitio                               |
| §3.3 mensaje en la consola                    | 0,25 j | **Ahora.** Sin él, el arreglo existe y nadie lo usa           |
| §3.4 retirar factor desde gestión de usuarios | 0,5 j  | Con el bloque 4                                               |

**1 jornada cierra el problema operativo**; la cuarta pieza es la red de
seguridad para el caso raro y viaja con el bloque 4.
