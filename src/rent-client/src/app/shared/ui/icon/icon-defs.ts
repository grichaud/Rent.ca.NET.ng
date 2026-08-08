/**
 * Definiciones de los iconos Lucide como datos, generado desde el IconTagHelper del origen.
 *
 * No se guardan como cadenas de markup a proposito: pintarlas con [innerHTML] sobre un
 * <svg> lanza "NotYetImplemented" en el render de servidor y, peor aun, aborta el ciclo de
 * deteccion de cambios completo, dejando sin bindings a componentes que no tienen nada que
 * ver (el sintoma tipico es un footer que aparece con todos los textos vacios).
 */
export interface IconElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
}

export const ICON_DEFS: Readonly<Record<string, readonly IconElement[]>> = {
  search: [
    { tag: 'circle', attrs: {"cx":"11","cy":"11","r":"8"} },
    { tag: 'path', attrs: {"d":"m21 21-4.3-4.3"} },
  ],
  'map-pin': [
    { tag: 'path', attrs: {"d":"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"} },
    { tag: 'circle', attrs: {"cx":"12","cy":"10","r":"3"} },
  ],
  heart: [
    { tag: 'path', attrs: {"d":"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"} },
  ],
  dog: [
    { tag: 'path', attrs: {"d":"M11.25 16.25h1.5L12 17z"} },
    { tag: 'path', attrs: {"d":"M16 14v.5"} },
    { tag: 'path', attrs: {"d":"M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309"} },
    { tag: 'path', attrs: {"d":"M8 14v.5"} },
    { tag: 'path', attrs: {"d":"M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.96-1.45-2.344-2.5"} },
  ],
  sofa: [
    { tag: 'path', attrs: {"d":"M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3"} },
    { tag: 'path', attrs: {"d":"M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0Z"} },
    { tag: 'path', attrs: {"d":"M4 18v2"} },
    { tag: 'path', attrs: {"d":"M20 18v2"} },
    { tag: 'path', attrs: {"d":"M12 4v9"} },
  ],
  sparkles: [
    { tag: 'path', attrs: {"d":"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"} },
    { tag: 'path', attrs: {"d":"M20 3v4"} },
    { tag: 'path', attrs: {"d":"M22 5h-4"} },
    { tag: 'path', attrs: {"d":"M4 17v2"} },
    { tag: 'path', attrs: {"d":"M5 18H3"} },
  ],
  languages: [
    { tag: 'path', attrs: {"d":"m5 8 6 6"} },
    { tag: 'path', attrs: {"d":"m4 14 6-6 2-3"} },
    { tag: 'path', attrs: {"d":"M2 5h12"} },
    { tag: 'path', attrs: {"d":"M7 2h1"} },
    { tag: 'path', attrs: {"d":"m22 22-5-10-5 10"} },
    { tag: 'path', attrs: {"d":"M14 18h6"} },
  ],
  'log-in': [
    { tag: 'path', attrs: {"d":"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"} },
    { tag: 'polyline', attrs: {"points":"10 17 15 12 10 7"} },
    { tag: 'line', attrs: {"x1":"15","x2":"3","y1":"12","y2":"12"} },
  ],
  'log-out': [
    { tag: 'path', attrs: {"d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"} },
    { tag: 'polyline', attrs: {"points":"16 17 21 12 16 7"} },
    { tag: 'line', attrs: {"x1":"21","x2":"9","y1":"12","y2":"12"} },
  ],
  'user-plus': [
    { tag: 'path', attrs: {"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"} },
    { tag: 'circle', attrs: {"cx":"9","cy":"7","r":"4"} },
    { tag: 'line', attrs: {"x1":"19","x2":"19","y1":"8","y2":"14"} },
    { tag: 'line', attrs: {"x1":"22","x2":"16","y1":"11","y2":"11"} },
  ],
  user: [
    { tag: 'path', attrs: {"d":"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"} },
    { tag: 'circle', attrs: {"cx":"12","cy":"7","r":"4"} },
  ],
  menu: [
    { tag: 'line', attrs: {"x1":"4","x2":"20","y1":"12","y2":"12"} },
    { tag: 'line', attrs: {"x1":"4","x2":"20","y1":"6","y2":"6"} },
    { tag: 'line', attrs: {"x1":"4","x2":"20","y1":"18","y2":"18"} },
  ],
  x: [
    { tag: 'path', attrs: {"d":"M18 6 6 18"} },
    { tag: 'path', attrs: {"d":"m6 6 12 12"} },
  ],
  sun: [
    { tag: 'circle', attrs: {"cx":"12","cy":"12","r":"4"} },
    { tag: 'path', attrs: {"d":"M12 2v2"} },
    { tag: 'path', attrs: {"d":"M12 20v2"} },
    { tag: 'path', attrs: {"d":"m4.93 4.93 1.41 1.41"} },
    { tag: 'path', attrs: {"d":"m17.66 17.66 1.41 1.41"} },
    { tag: 'path', attrs: {"d":"M2 12h2"} },
    { tag: 'path', attrs: {"d":"M20 12h2"} },
    { tag: 'path', attrs: {"d":"m6.34 17.66-1.41 1.41"} },
    { tag: 'path', attrs: {"d":"m19.07 4.93-1.41 1.41"} },
  ],
  moon: [
    { tag: 'path', attrs: {"d":"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"} },
  ],
  bed: [
    { tag: 'path', attrs: {"d":"M2 4v16"} },
    { tag: 'path', attrs: {"d":"M2 8h18a2 2 0 0 1 2 2v10"} },
    { tag: 'path', attrs: {"d":"M2 17h20"} },
    { tag: 'path', attrs: {"d":"M6 8v9"} },
  ],
  bath: [
    { tag: 'path', attrs: {"d":"M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"} },
    { tag: 'line', attrs: {"x1":"10","x2":"8","y1":"5","y2":"7"} },
    { tag: 'line', attrs: {"x1":"2","x2":"22","y1":"12","y2":"12"} },
    { tag: 'line', attrs: {"x1":"7","x2":"7","y1":"19","y2":"21"} },
    { tag: 'line', attrs: {"x1":"17","x2":"17","y1":"19","y2":"21"} },
  ],
  home: [
    { tag: 'path', attrs: {"d":"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"} },
    { tag: 'polyline', attrs: {"points":"9 22 9 12 15 12 15 22"} },
  ],
  'chevron-down': [
    { tag: 'path', attrs: {"d":"m6 9 6 6 6-6"} },
  ],
  'chevron-left': [
    { tag: 'path', attrs: {"d":"m15 18-6-6 6-6"} },
  ],
  'chevron-right': [
    { tag: 'path', attrs: {"d":"m9 18 6-6-6-6"} },
  ],
  'building-2': [
    { tag: 'path', attrs: {"d":"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"} },
    { tag: 'path', attrs: {"d":"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"} },
    { tag: 'path', attrs: {"d":"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"} },
    { tag: 'path', attrs: {"d":"M10 6h4"} },
    { tag: 'path', attrs: {"d":"M10 10h4"} },
    { tag: 'path', attrs: {"d":"M10 14h4"} },
    { tag: 'path', attrs: {"d":"M10 18h4"} },
  ],
  users: [
    { tag: 'path', attrs: {"d":"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"} },
    { tag: 'circle', attrs: {"cx":"9","cy":"7","r":"4"} },
    { tag: 'path', attrs: {"d":"M22 21v-2a4 4 0 0 0-3-3.87"} },
    { tag: 'path', attrs: {"d":"M16 3.13a4 4 0 0 1 0 7.75"} },
  ],
  mail: [
    { tag: 'rect', attrs: {"width":"20","height":"16","x":"2","y":"4","rx":"2"} },
    { tag: 'path', attrs: {"d":"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"} },
  ],
  phone: [
    { tag: 'path', attrs: {"d":"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"} },
  ],
  check: [
    { tag: 'path', attrs: {"d":"M20 6 9 17l-5-5"} },
  ],
  building: [
    { tag: 'rect', attrs: {"width":"16","height":"20","x":"4","y":"2","rx":"2","ry":"2"} },
    { tag: 'path', attrs: {"d":"M9 22v-4h6v4"} },
    { tag: 'path', attrs: {"d":"M8 6h.01"} },
    { tag: 'path', attrs: {"d":"M16 6h.01"} },
    { tag: 'path', attrs: {"d":"M12 6h.01"} },
    { tag: 'path', attrs: {"d":"M12 10h.01"} },
    { tag: 'path', attrs: {"d":"M12 14h.01"} },
    { tag: 'path', attrs: {"d":"M16 10h.01"} },
    { tag: 'path', attrs: {"d":"M16 14h.01"} },
    { tag: 'path', attrs: {"d":"M8 10h.01"} },
    { tag: 'path', attrs: {"d":"M8 14h.01"} },
  ],
  tag: [
    { tag: 'path', attrs: {"d":"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"} },
    { tag: 'circle', attrs: {"cx":"7.5","cy":"7.5","r":".5","fill":"currentColor"} },
  ],
  lock: [
    { tag: 'rect', attrs: {"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"} },
    { tag: 'path', attrs: {"d":"M7 11V7a5 5 0 0 1 10 0v4"} },
  ],
  'layout-dashboard': [
    { tag: 'rect', attrs: {"width":"7","height":"9","x":"3","y":"3","rx":"1"} },
    { tag: 'rect', attrs: {"width":"7","height":"5","x":"14","y":"3","rx":"1"} },
    { tag: 'rect', attrs: {"width":"7","height":"9","x":"14","y":"12","rx":"1"} },
    { tag: 'rect', attrs: {"width":"7","height":"5","x":"3","y":"16","rx":"1"} },
  ],
  bell: [
    { tag: 'path', attrs: {"d":"M10.268 21a2 2 0 0 0 3.464 0"} },
    { tag: 'path', attrs: {"d":"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"} },
  ],
  'bell-off': [
    { tag: 'path', attrs: {"d":"M10.268 21a2 2 0 0 0 3.464 0"} },
    { tag: 'path', attrs: {"d":"M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742"} },
    { tag: 'path', attrs: {"d":"m2 2 20 20"} },
    { tag: 'path', attrs: {"d":"M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05"} },
  ],
  'message-square': [
    { tag: 'path', attrs: {"d":"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"} },
  ],
  'external-link': [
    { tag: 'path', attrs: {"d":"M15 3h6v6"} },
    { tag: 'path', attrs: {"d":"M10 14 21 3"} },
    { tag: 'path', attrs: {"d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"} },
  ],
  'arrow-right': [
    { tag: 'path', attrs: {"d":"M5 12h14"} },
    { tag: 'path', attrs: {"d":"m12 5 7 7-7 7"} },
  ],
  'trash-2': [
    { tag: 'path', attrs: {"d":"M3 6h18"} },
    { tag: 'path', attrs: {"d":"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"} },
    { tag: 'path', attrs: {"d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"} },
    { tag: 'line', attrs: {"x1":"10","x2":"10","y1":"11","y2":"17"} },
    { tag: 'line', attrs: {"x1":"14","x2":"14","y1":"11","y2":"17"} },
  ],
  plus: [
    { tag: 'path', attrs: {"d":"M5 12h14"} },
    { tag: 'path', attrs: {"d":"M12 5v14"} },
  ],
  eye: [
    { tag: 'path', attrs: {"d":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"} },
    { tag: 'circle', attrs: {"cx":"12","cy":"12","r":"3"} },
  ],
  'eye-off': [
    { tag: 'path', attrs: {"d":"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"} },
    { tag: 'path', attrs: {"d":"M14.084 14.158a3 3 0 0 1-4.242-4.242"} },
    { tag: 'path', attrs: {"d":"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"} },
    { tag: 'path', attrs: {"d":"m2 2 20 20"} },
  ],
  filter: [
    { tag: 'polygon', attrs: {"points":"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"} },
  ],
  calendar: [
    { tag: 'path', attrs: {"d":"M8 2v4"} },
    { tag: 'path', attrs: {"d":"M16 2v4"} },
    { tag: 'rect', attrs: {"width":"18","height":"18","x":"3","y":"4","rx":"2"} },
    { tag: 'path', attrs: {"d":"M3 10h18"} },
  ],
  'check-circle': [
    { tag: 'path', attrs: {"d":"M21.801 10A10 10 0 1 1 17 3.335"} },
    { tag: 'path', attrs: {"d":"m9 11 3 3L22 4"} },
  ],
  'alert-circle': [
    { tag: 'circle', attrs: {"cx":"12","cy":"12","r":"10"} },
    { tag: 'line', attrs: {"x1":"12","x2":"12","y1":"8","y2":"12"} },
    { tag: 'line', attrs: {"x1":"12","x2":"12.01","y1":"16","y2":"16"} },
  ],
  info: [
    { tag: 'circle', attrs: {"cx":"12","cy":"12","r":"10"} },
    { tag: 'path', attrs: {"d":"M12 16v-4"} },
    { tag: 'path', attrs: {"d":"M12 8h.01"} },
  ],
  send: [
    { tag: 'path', attrs: {"d":"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"} },
    { tag: 'path', attrs: {"d":"m21.854 2.147-10.94 10.939"} },
  ],
  loader: [
    { tag: 'path', attrs: {"d":"M12 2v4"} },
    { tag: 'path', attrs: {"d":"m16.2 7.8 2.9-2.9"} },
    { tag: 'path', attrs: {"d":"M18 12h4"} },
    { tag: 'path', attrs: {"d":"m16.2 16.2 2.9 2.9"} },
    { tag: 'path', attrs: {"d":"M12 18v4"} },
    { tag: 'path', attrs: {"d":"m4.9 19.1 2.9-2.9"} },
    { tag: 'path', attrs: {"d":"M2 12h4"} },
    { tag: 'path', attrs: {"d":"m4.9 4.9 2.9 2.9"} },
  ],
  'sliders-horizontal': [
    { tag: 'line', attrs: {"x1":"21","x2":"14","y1":"4","y2":"4"} },
    { tag: 'line', attrs: {"x1":"10","x2":"3","y1":"4","y2":"4"} },
    { tag: 'line', attrs: {"x1":"21","x2":"12","y1":"12","y2":"12"} },
    { tag: 'line', attrs: {"x1":"8","x2":"3","y1":"12","y2":"12"} },
    { tag: 'line', attrs: {"x1":"21","x2":"16","y1":"20","y2":"20"} },
    { tag: 'line', attrs: {"x1":"12","x2":"3","y1":"20","y2":"20"} },
    { tag: 'line', attrs: {"x1":"14","x2":"14","y1":"2","y2":"6"} },
    { tag: 'line', attrs: {"x1":"8","x2":"8","y1":"10","y2":"14"} },
    { tag: 'line', attrs: {"x1":"16","x2":"16","y1":"18","y2":"22"} },
  ],
  'grid-3x3': [
    { tag: 'rect', attrs: {"width":"18","height":"18","x":"3","y":"3","rx":"2"} },
    { tag: 'path', attrs: {"d":"M3 9h18"} },
    { tag: 'path', attrs: {"d":"M3 15h18"} },
    { tag: 'path', attrs: {"d":"M9 3v18"} },
    { tag: 'path', attrs: {"d":"M15 3v18"} },
  ],
  list: [
    { tag: 'line', attrs: {"x1":"8","x2":"21","y1":"6","y2":"6"} },
    { tag: 'line', attrs: {"x1":"8","x2":"21","y1":"12","y2":"12"} },
    { tag: 'line', attrs: {"x1":"8","x2":"21","y1":"18","y2":"18"} },
    { tag: 'line', attrs: {"x1":"3","x2":"3.01","y1":"6","y2":"6"} },
    { tag: 'line', attrs: {"x1":"3","x2":"3.01","y1":"12","y2":"12"} },
    { tag: 'line', attrs: {"x1":"3","x2":"3.01","y1":"18","y2":"18"} },
  ],
  map: [
    { tag: 'path', attrs: {"d":"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"} },
    { tag: 'path', attrs: {"d":"M15 5.764v15"} },
    { tag: 'path', attrs: {"d":"M9 3.236v15"} },
  ],
  car: [
    { tag: 'path', attrs: {"d":"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"} },
    { tag: 'circle', attrs: {"cx":"7","cy":"17","r":"2"} },
    { tag: 'path', attrs: {"d":"M9 17h6"} },
    { tag: 'circle', attrs: {"cx":"17","cy":"17","r":"2"} },
  ],
  'layout-grid': [
    { tag: 'rect', attrs: {"width":"7","height":"7","x":"3","y":"3","rx":"1"} },
    { tag: 'rect', attrs: {"width":"7","height":"7","x":"14","y":"3","rx":"1"} },
    { tag: 'rect', attrs: {"width":"7","height":"7","x":"14","y":"14","rx":"1"} },
    { tag: 'rect', attrs: {"width":"7","height":"7","x":"3","y":"14","rx":"1"} },
  ],
  'file-plus': [
    { tag: 'path', attrs: {"d":"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"} },
    { tag: 'polyline', attrs: {"points":"14 2 14 8 20 8"} },
    { tag: 'line', attrs: {"x1":"12","x2":"12","y1":"18","y2":"12"} },
    { tag: 'line', attrs: {"x1":"9","x2":"15","y1":"15","y2":"15"} },
  ],
  inbox: [
    { tag: 'polyline', attrs: {"points":"22 12 16 12 14 15 10 15 8 12 2 12"} },
    { tag: 'path', attrs: {"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"} },
  ],
  crown: [
    { tag: 'path', attrs: {"d":"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"} },
    { tag: 'path', attrs: {"d":"M5 21h14"} },
  ],
  star: [
    { tag: 'polygon', attrs: {"points":"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"} },
  ],
  'share-2': [
    { tag: 'circle', attrs: {"cx":"18","cy":"5","r":"3"} },
    { tag: 'circle', attrs: {"cx":"6","cy":"12","r":"3"} },
    { tag: 'circle', attrs: {"cx":"18","cy":"19","r":"3"} },
    { tag: 'line', attrs: {"x1":"8.59","x2":"15.42","y1":"13.51","y2":"17.49"} },
    { tag: 'line', attrs: {"x1":"15.41","x2":"8.59","y1":"6.51","y2":"10.49"} },
  ],
  'maximize-2': [
    { tag: 'polyline', attrs: {"points":"15 3 21 3 21 9"} },
    { tag: 'polyline', attrs: {"points":"9 21 3 21 3 15"} },
    { tag: 'line', attrs: {"x1":"21","x2":"14","y1":"3","y2":"10"} },
    { tag: 'line', attrs: {"x1":"3","x2":"10","y1":"21","y2":"14"} },
  ],
  'shield-check': [
    { tag: 'path', attrs: {"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"} },
    { tag: 'path', attrs: {"d":"m9 12 2 2 4-4"} },
  ],
};
