import type { JSX } from 'react';
import type { Metadata } from 'next';
import { EstadoSinPermiso } from '@/componentes/estados';

export const metadata: Metadata = { title: 'Sin consola web' };

/**
 * Un residente que entra por el navegador. No es un error suyo ni un fallo del
 * sistema: su superficie es la app Flutter de la ETAPA 11. Dejarlo en un
 * tablero vacío sin explicación sería peor que decírselo.
 */
const SinConsola = (): JSX.Element => (
  <EstadoSinPermiso descripcion="Tu rol no usa la consola web. Los residentes gestionan visitantes, vehículos y zonas comunes desde la aplicación móvil de Next Control Residencial." />
);

export default SinConsola;
