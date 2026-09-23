import { describe, expect, it } from 'vitest';
import { esAdmisible, motivoDeRechazo } from './caracteres-admitidos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ESTA VALIDACIÓN AHORRA NO ES UN VIAJE: SON INTENTOS
 *
 * Un carácter que el equipo no admite vuelve como «el equipo rechazó la
 * credencial» —el mismo mensaje de una clave equivocada— y el operador vuelve a
 * intentarlo. Estos aparatos **bloquean la cuenta** tras unos pocos fallos, así
 * que ese carácter acaba convertido en un equipo al que hay que ir físicamente.
 */

describe('el usuario', () => {
  it('admite letras y dígitos', () => {
    expect(esAdmisible('usuario', 'servicio01')).toBe(true);
  });

  it('admite los signos de puntuación corrientes', () => {
    expect(esAdmisible('usuario', 'ncr_servicio-01')).toBe(true);
  });

  it('NO admite espacios', () => {
    expect(esAdmisible('usuario', 'usuario de servicio')).toBe(false);
  });

  it('ni acentos: el juego del equipo es ASCII', () => {
    expect(esAdmisible('usuario', 'portería')).toBe(false);
  });

  it('y el motivo dice qué hacer, no «valor inválido»', () => {
    expect(motivoDeRechazo('usuario', 'con espacios')).toMatch(/sin espacios/i);
  });
});

describe('la contraseña', () => {
  it('admite todo lo del usuario', () => {
    expect(esAdmisible('clave', 'Cl4v3-d3_s3rv1c10!')).toBe(true);
  });

  it('y además el espacio, que su juego sí incluye', () => {
    // El juego de la contraseña CONTIENE al del usuario, nunca al revés.
    expect(esAdmisible('clave', 'una clave larga con espacios')).toBe(true);
  });

  it('pero nunca caracteres de control', () => {
    expect(esAdmisible('clave', 'clave\u0007con\u0000nulo')).toBe(false);
  });

  it('y el motivo del control explica de dónde salen, porque no se ven', () => {
    expect(motivoDeRechazo('clave', 'clave\u0000mala')).toMatch(/pegar desde otro sitio/i);
  });
});

describe('el nombre visible', () => {
  it('admite acentos y ñ, que es lo que se va a escribir aquí', () => {
    expect(esAdmisible('nombre', 'Cámara de la entrada · portería ñ')).toBe(true);
  });

  it('pero tampoco admite caracteres de control', () => {
    expect(esAdmisible('nombre', 'Cámara\u0001rota')).toBe(false);
  });
});

describe('vacío no es lo mismo que mal escrito', () => {
  it('y el motivo lo distingue: uno manda a escribirlo, el otro a cambiarlo', () => {
    expect(motivoDeRechazo('usuario', '')).toMatch(/escribirlo/i);
    expect(motivoDeRechazo('usuario', 'con espacios')).not.toMatch(/escribirlo/i);
  });
});
