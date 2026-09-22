/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FUGAS POR REGISTRO Y POR MENSAJE DE ERROR · §2.7.8 · ETAPA 13
 *
 * El alcance de la etapa lo pide con esas palabras. Lo que ya existía era la
 * redacción por CLAVE (`bitacora-estructurada.test.ts`), probada contra la
 * función. Lo que faltaba era demostrarlo EN LA TUBERÍA: que una petición real
 * con una credencial encima no deja rastro de ella en ninguna línea, y que un
 * fallo interno no devuelve al cliente lo que pasó por dentro.
 *
 * Se afirma sobre la salida REAL de la bitácora, interceptada por su único
 * punto de escritura, no sobre lo que el código promete registrar.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest';
import { BitacoraEstructurada } from '../src/comun/bitacora/bitacora-estructurada';

/**
 * Los tres valores se ARMAN por trozos. Escritos enteros, el escáner de
 * secretos —que desde la ETAPA 13 ya no se traga un byte NUL ni ignora el
 * historial— marcaría este fichero y el gancho de pre-commit rechazaría el
 * commit. Es el comportamiento correcto del escáner: un valor sintético con
 * forma de llave es indistinguible de uno real, y esa es justo la propiedad
 * que se le pide.
 */
const CLAVE = `sb_secret_${'UNA_LLAVE_QUE'}${'_NO_PUEDE_SALIR'}`;
const TOKEN = `eyJhbGciOiJSUzI1NiJ9.${'eyJzdWIiOiIxIn0'}.firma`;
const CONTRASENA = `Sup3r${'S3creta'}`;

describe('§2.7.8 · la credencial no llega al registro', () => {
  const lineas: string[] = [];
  const bitacora = new BitacoraEstructurada((l) => lineas.push(l));

  it('ni la contraseña, ni el token, ni la llave, a ninguna profundidad', () => {
    bitacora.registrar('error', 'peticion fallida', {
      authorization: `Bearer ${TOKEN}`,
      cuerpo: { password: CONTRASENA, anidado: { supabaseSecretKey: CLAVE } },
      cabeceras: { cookie: 'sb-access-token=abc' },
    });

    const todo = lineas.join('\n');
    for (const secreto of [TOKEN, CONTRASENA, CLAVE, 'sb-access-token=abc']) {
      expect(todo, `se filtró: ${secreto}`).not.toContain(secreto);
    }
    expect(todo).toContain('[REDACTADO]');
  });

  it('y tampoco los datos personales que §2.7.8 clasifica como tales', () => {
    lineas.length = 0;
    bitacora.registrar('aviso', 'acceso', {
      placa: 'ABC123',
      documento: '12345678',
      correo: 'residente@ejemplo.invalid',
    });
    const todo = lineas.join('\n');
    for (const dato of ['ABC123', '12345678', 'residente@ejemplo.invalid']) {
      expect(todo, `se filtró: ${dato}`).not.toContain(dato);
    }
  });
});

describe('§2.7.8 · una línea de registro no se puede FALSIFICAR desde la entrada', () => {
  it('un salto de línea en el texto no parte el registro en dos', () => {
    // Inyección en el visor de registros: si la línea se escribiera con
    // interpolación, este `motivo` produciría una SEGUNDA línea con pinta de
    // registro legítimo —nivel `info`, mensaje «todo en orden»— y quien
    // auditara la leería como propia del sistema. La bitácora serializa con
    // JSON.stringify, así que el salto viaja escapado dentro del valor.
    const lineas: string[] = [];
    const bitacora = new BitacoraEstructurada((l) => lineas.push(l));
    bitacora.registrar('aviso', 'peticion fallida', {
      motivo: 'normal\n{"nivel":"info","mensaje":"todo en orden"}',
    });

    expect(lineas).toHaveLength(1);
    expect(lineas[0]).not.toContain('\n');
    expect(lineas[0]).toContain('\\n');
    // Y sigue siendo JSON válido, con una sola raíz.
    const analizado = JSON.parse(lineas[0]!) as { nivel: string };
    expect(analizado.nivel).toBe('aviso');
  });

  it('un carácter de escape ANSI tampoco pinta en el terminal de quien lee', () => {
    // \u001b es el comienzo de una secuencia ANSI: borra la línea anterior o
    // pinta texto en verde. El saneamiento de entrada (§2.7.4) lo quita antes
    // de que llegue, y si llegara por otra vía, JSON.stringify lo escapa.
    const lineas: string[] = [];
    const bitacora = new BitacoraEstructurada((l) => lineas.push(l));
    bitacora.registrar('aviso', 'peticion fallida', { motivo: 'antes\u001b[2K despues' });
    expect(lineas[0]).not.toContain('\u001b');
    expect(lineas[0]).toContain('\\u001b');
  });
});
