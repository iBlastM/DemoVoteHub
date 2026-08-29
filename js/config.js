// ============================================================
// config.js — Partidos, coaliciones, colores y constantes.
// Datos ficticios con fines de demostración (estilo VoteHub).
// ============================================================

export const ELECTION_DATE = new Date('2027-06-06T08:00:00');
export const UPDATED_LABEL = '9 JUL 2027 · 11:30';

// Fuerzas políticas consideradas en la demo.
// Colores pensados para un mapa multipartidista legible.
export const PARTIES = {
  MORENA: {
    id: 'MORENA',
    nombre: 'Morena',
    coalicion: 'Sigamos Haciendo Historia',
    aliados: 'Morena · PT · PVEM',
    color: '#A50D4E', // guinda
    colorSoft: '#E9B9CB',
    tinta: '#ffffff',
    logo: 'images/partidos/morena.png',
  },
  PAN: {
    id: 'PAN',
    nombre: 'PAN',
    coalicion: 'Frente por México',
    aliados: 'PAN · PRI',
    color: '#0A5CA8', // azul
    colorSoft: '#B4D0EC',
    tinta: '#ffffff',
    logo: 'images/partidos/pan.png',
  },
  PRI: {
    id: 'PRI',
    nombre: 'PRI',
    coalicion: 'Frente por México',
    aliados: 'PRI · PAN',
    color: '#1E9E5A', // verde
    colorSoft: '#BEE6CE',
    tinta: '#ffffff',
    logo: 'images/partidos/pri.png',
  },
  MC: {
    id: 'MC',
    nombre: 'Movimiento Ciudadano',
    coalicion: 'Movimiento Ciudadano',
    aliados: 'MC',
    color: '#F28C00', // naranja
    colorSoft: '#FBDCAE',
    tinta: '#3a2400',
    logo: 'images/partidos/mc.png',
  },
};

// Orden de despliegue (por peso esperado en la demo).
export const PARTY_ORDER = ['MORENA', 'PAN', 'PRI', 'MC'];

// Bloques para el "balance de fuerzas": oficialismo vs oposición.
export const BLOQUES = {
  oficialismo: { nombre: 'Oficialismo', parties: ['MORENA'], color: '#A50D4E' },
  oposicion: { nombre: 'Oposición', parties: ['PAN', 'PRI'], color: '#0A5CA8' },
  emergente: { nombre: 'Movimiento Ciudadano', parties: ['MC'], color: '#F28C00' },
};

// Umbrales de competitividad -> estatus de la contienda.
// margen = ventaja del favorito sobre el segundo lugar (en puntos).
export const ESTATUS = [
  { id: 'segura', label: 'Segura', min: 15 },
  { id: 'probable', label: 'Probable', min: 8 },
  { id: 'inclinada', label: 'Inclinada', min: 3 },
  { id: 'renida', label: 'Reñida', min: 0 },
];

export function estatusPorMargen(margen) {
  const m = Math.abs(margen);
  return ESTATUS.find((e) => m >= e.min) || ESTATUS[ESTATUS.length - 1];
}

// Color neutro para estados que no eligen gubernatura en 2027.
export const SIN_ELECCION = '#D7DDE4';

// Paleta de interfaz (magenta INE como acento del subject).
export const UI = {
  accent: '#C6007E',
};
