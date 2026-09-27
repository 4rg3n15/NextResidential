/**
 * Un JPEG mínimo con las medidas pedidas: SOI, un cuadro SOF0 y EOI. No se ve
 * —no lleva datos de imagen—, pero su cabecera es la de un JPEG real, que es lo
 * único que el adaptador lee. Para pruebas y para el equipo simulado.
 */
export const jpegConMedidas = (ancho = 640, alto = 480, relleno = 0): Uint8Array => {
  const cabecera = [
    0xff,
    0xd8,
    // APP0 de 16 bytes, como los de las cámaras.
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    // SOF0: longitud 11, precisión 8, alto, ancho, 1 componente.
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (alto >> 8) & 0xff,
    alto & 0xff,
    (ancho >> 8) & 0xff,
    ancho & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
  ];
  const b = new Uint8Array(cabecera.length + relleno + 2);
  b.set(cabecera, 0);
  b.set([0xff, 0xd9], cabecera.length + relleno);
  return b;
};
