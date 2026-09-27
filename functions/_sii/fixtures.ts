/**
 * fixtures.ts — CSVs de ejemplo en el formato real de descarga del RCV del SII.
 *
 * Se usan en el modo mock (SII_MOCK=1) y en tests/parse.test.mjs.
 * Solo sintaxis "erasable" (consts + template strings) para que Node 24 pueda
 * importar este archivo directo con type-stripping, sin compilar.
 *
 * Estructura deliberada:
 *  - compras: cabecera "clásica" (Nro correlativo + Folio + RUT Proveedor +
 *    Monto IVA Recuperable) y una fila final de totales que el parser omite.
 *  - ventas: cabecera variante (RUT Cliente + IVA), orden de columnas
 *    distinto (Monto Total antes que Monto Neto/IVA) y fila resumen final.
 *  - Ambas incluyen una nota de crédito con montos negativos "(1.190)".
 */

export const CSV_COMPRAS = `Nro;Tipo Doc;RUT Proveedor;Razon Social;Folio;Fecha Docto;Monto Neto;Monto IVA Recuperable;Monto Total
1;Factura Electronica;76.123.456-7;SERVICIOS ANDES SPA;1284;05/01/2026;450.000;85.500;535.500
2;Factura Electronica;96.789.120-3;DISTRIBUIDORA PACIFICO LTDA.;552;09/01/2026;1.200.000;228.000;1.428.000
3;Factura Electronica;77.555.444-2;COMERCIAL EL ROBLE EIRL;88991;15/01/2026;320.000;60.800;380.800
4;Nota de Credito Electronica;76.123.456-7;SERVICIOS ANDES SPA;1290;20/01/2026;(100.000);(19.000);(119.000)
5;Factura Electronica;60.987.650-K;PAPELERIA CRISTAL SA;20417;28/01/2026;395.000;75.050;470.050
;Total General;;;;;2.265.000;430.350;2.695.350
`;

export const CSV_VENTAS = `Nro;Tipo Doc;RUT Cliente;Razon Social;Folio;Fecha Docto;Monto Total;Monto Neto;IVA
1;Factura Electronica;77.333.222-1;MINIMARKET DON PEPE SPA;412;03/01/2026;928.200;780.000;148.200
2;Factura Electronica;96.555.111-6;INVERSIONES CONDELL LTDA;413;08/01/2026;2.558.500;2.150.000;408.500
3;Factura Electronica;76.999.888-5;TECNO PARTS CHILE SA;414;14/01/2026;761.600;640.000;121.600
4;Nota de Credito Electronica;77.333.222-1;MINIMARKET DON PEPE SPA;415;21/01/2026;(178.500);(150.000);(28.500)
5;Factura Electronica;61.234.567-0;FERRETERIA LA ESTRELLA;416;29/01/2026;1.059.100;890.000;169.100
Resumen;;;;;;;
`;
