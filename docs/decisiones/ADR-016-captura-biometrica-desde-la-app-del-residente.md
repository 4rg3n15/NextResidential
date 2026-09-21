# ADR-016 · La captura biométrica del residente comparte el caso de uso, no el controlador

**Fecha:** 2026-09-20 · **Estado:** aceptada · **Etapa:** 11-C

## Contexto

CU-02 y las historias HU-12 y HU-13 piden que el rostro de un visitante se
capture, se valide en calidad y quede pendiente del consentimiento **de su
titular**. Hasta la 11-C esa operación tenía una sola puerta:

```
POST /copropiedades/:id/biometria/capturas
@Roles('administrador', 'portero', 'operador_central')
```

Es la ruta del mostrador de portería, y recibe **`titularId` en el cuerpo**:
quien atiende el mostrador tiene delante a la persona, la identifica y la
nombra. Para ese rol es correcto.

La app del residente (M-4) necesita la misma operación desde el otro lado: el
residente autoriza a su visitante y le toma la foto. La forma barata de
concedérselo era añadir `'residente'` al decorador. Un cambio de una palabra.

## El problema con ese cambio de una palabra

Habría dado a cada residente del conjunto una entrada que **acepta el titular
desde el cuerpo de la petición**. Es decir: la posibilidad de capturar un rostro
y pedirle el consentimiento a quien uno escriba —al vecino, a sí mismo, a
cualquier persona del padrón—.

Eso no es un fallo de permisos: es incumplir RN-10 y el principio de finalidad
de la **Ley 1581 de 2012** sin escribir una sola línea de más. El consentimiento
quedaría solicitado a una persona que no es la titular del dato, y el registro
de auditoría diría que sí lo es.

Y no se arregla validando en el controlador que `titularId` sea «razonable»:
mientras el campo exista en la superficie, alguien puede llamarla.

## Decisión

**Una ruta propia para el residente, que no recibe el titular:**

```
POST /copropiedades/:id/mi/autorizaciones/:autorizacionId/rostro
@Roles('residente')
```

El titular se **deriva de la autorización**, que ya dice de quién es la visita.
La consulta que lo busca filtra por `(copropiedad_id, vivienda_id, id)`, así que
nombrar la autorización del vecino no devuelve titular, y sin titular no hay
captura. No hace falta un `if` de permiso porque no hay nada que permitir: la
consulta no la encuentra.

**Lo que se comparte es el caso de uso, no el controlador.** `CapturarRostro`
sale del barril de `biometria` —el controlador no—, y las dos superficies lo
ejecutan: la validación de calidad, el cifrado del vector, la creación del
consentimiento en estado `pendiente` y la programación de la supresión son
literalmente el mismo código en las dos. Lo que difiere es de dónde sale el
titular y quién puede pedirlo, que es justo lo que debe diferir.

## Consecuencias

- **`titularId` en el cuerpo se rechaza con 400**, no se ignora. El
  `ValidationPipe` global corre con `forbidNonWhitelisted`, así que un cliente
  que lo enviara recibe un error en vez de creer que sirvió.
- **La app del residente no tiene casilla de aceptar.** No es una omisión de
  diseño: es que no puede existir. El agregado `ConsentimientoBiometrico` exige
  `quienAcepta === titularId` y lo verifica el dominio; una casilla en la
  pantalla del residente sería la firma de otro en un papel.
- **El desenlace bueno de la pantalla no dice «listo»**, dice a quién se le pidió
  y que hasta que responda la plantilla no se sincroniza con ninguna terminal
  (RN-09). Decir «listo» mandaría al visitante a una puerta que no se abre.
- **La suite de aislamiento del segundo eje cubre la ruta nueva** por las dos
  direcciones: el residente captura contra la suya (201, con el nombre del
  visitante como titular) y contra la del vecino recibe **404** —no 403, que
  confirmaría que existe—.
- El módulo `residente` importa `BiometriaModule`; no toca la bóveda, ni los
  repositorios de plantillas, ni el proveedor de terminales, y no podría,
  porque no los inyecta.

## Alternativas descartadas

**Abrir la ruta del mostrador al rol `residente`.** Descartada por lo anterior:
el campo `titularId` en la superficie es el defecto, no el permiso.

**Un caso de uso duplicado en el módulo del residente.** Habría dejado dos
implementaciones de la validación de calidad y del cifrado, y la segunda habría
envejecido: el día que cambie un umbral (KPI-16), una de las dos superficies
seguiría con el viejo y nadie lo notaría.

**Derivar el titular en el controlador y seguir con una sola ruta.** Es la misma
ruta con una rama más; el campo seguiría existiendo para los otros roles y una
refactorización futura podría reconectarlo. La separación por ruta lo hace
imposible de reconectar por descuido.
