import { env } from '../config/env.js'
import { RESPONSABLE } from '../consent/versions.js'

/**
 * La envoltura HTML de todos los correos.
 *
 * Es deliberadamente pobre por dentro: tablas, estilos en línea y una sola
 * imagen. Los clientes de correo ignoran las hojas de estilo, no entienden
 * flex ni grid, y penalizan el HTML pesado. Un correo simple llega a la
 * bandeja de entrada; uno bonito llega a spam.
 *
 * Los colores son los mismos de `frontend/app/globals.css`. Están copiados y
 * no importados porque el correo no puede leer variables CSS: si la paleta del
 * sitio cambia, hay que cambiarlos aquí también.
 *
 * Cada correo se manda en HTML y en texto plano. El texto no es un adorno: es
 * lo que ven los lectores de pantalla y lo que queda cuando el HTML falla.
 */

// --- Paleta del sitio ---
const FONDO = '#efe5d9' // --color-bg-default
const TARJETA = '#ffffff' // --color-card-bg
const TEXTO = '#37352f' // --color-text-default
const SUAVE = '#63625b' // --color-text-light
const BORDE = '#e9e9e7' // --color-border-default
const MARCA = '#15162e' // --navbar-background-color
const MARCA_TEXTO = '#fff6eb' // --navbar-text-color
const RADIO = '14px' // --border-radii-layout

/**
 * El logo se sirve desde el sitio, así que la ruta tiene que ser absoluta: en
 * un correo no existe "la carpeta de al lado".
 *
 * Va con `alt` de verdad porque Gmail y Outlook bloquean las imágenes por
 * defecto: mucha gente va a ver ese texto y nunca la imagen.
 */
function encabezado() {
  return `<tr><td style="background-color:${MARCA};padding:20px 26px;text-align:left;">
    <img src="${urlDelSitio('/images/logo-correo.png')}" width="220" alt="Red Aquí Estamos"
         style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:220px;color:${MARCA_TEXTO};font-size:17px;font-weight:600;">
  </td></tr>`
}

/**
 * @param {object} p
 * @param {string} p.titulo      Encabezado dentro del correo.
 * @param {string[]} p.parrafos  Cada uno va en su propio <p>.
 * @param {{texto: string, url: string}} [p.boton]
 * @param {string[]} [p.datos]   Lista de "clave: valor" para el bloque de datos.
 */
export function envolver({ titulo, parrafos, boton, datos }) {
  const cuerpo = parrafos
    .map(
      (t) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${TEXTO};">${t}</p>`,
    )
    .join('')

  const bloqueDatos = datos?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background-color:${FONDO};border-radius:10px;">
         <tr><td style="padding:16px 18px;">
           ${datos
             .map(
               (d) =>
                 `<div style="font-size:14px;line-height:1.8;color:${TEXTO};">${d}</div>`,
             )
             .join('')}
         </td></tr>
       </table>`
    : ''

  const bloqueBoton = boton
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
         <tr><td style="background-color:${MARCA};border-radius:8px;">
           <a href="${boton.url}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:600;color:${MARCA_TEXTO};text-decoration:none;">${boton.texto}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${SUAVE};">
         Si el botón no funciona, copia este enlace en tu navegador:<br>
         <a href="${boton.url}" style="color:${SUAVE};">${boton.url}</a>
       </p>`
    : ''

  return `<!doctype html>
<html lang="es"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background-color:${FONDO};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${FONDO};padding:28px 12px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${TARJETA};border-radius:${RADIO};overflow:hidden;">
        ${encabezado()}
        <tr><td style="padding:28px 26px 4px;">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:600;color:${TEXTO};">${titulo}</h1>
          ${cuerpo}
          ${bloqueDatos}
          ${bloqueBoton}
        </td></tr>
        <tr><td style="padding:8px 26px 26px;">
          <p style="margin:0;padding-top:18px;border-top:1px solid ${BORDE};font-size:12px;line-height:1.6;color:${SUAVE};">
            Este correo es parte del funcionamiento de la red; no es publicidad.
            Puedes pedirnos conocer, actualizar o eliminar tus datos, o retirar tu
            autorización, escribiendo a ${RESPONSABLE.canalHabeasData}.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:${SUAVE};">
        Red Aquí Estamos · Acompañar es una forma de reconstruir nuestro país
      </p>
    </td></tr>
  </table>
</body></html>`
}

/** La versión en texto plano del mismo contenido. */
export function envolverTexto({ titulo, parrafos, boton, datos }) {
  const partes = [
    titulo,
    '',
    ...parrafos.map(sinEtiquetas),
    datos?.length ? '' : null,
    ...(datos ?? []).map(sinEtiquetas),
    boton ? '' : null,
    boton ? `${boton.texto}: ${boton.url}` : null,
    '',
    '—',
    'Red Aquí Estamos. Este correo es parte del funcionamiento de la red; no es publicidad.',
    `Para conocer, actualizar o eliminar tus datos, escríbenos a ${RESPONSABLE.canalHabeasData}.`,
  ]

  return partes.filter((p) => p !== null).join('\n')
}

/** Los párrafos llevan algo de HTML (negritas, enlaces); el texto plano no. */
function sinEtiquetas(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim()
}

/** Une el sitio con una ruta, sin depender de barras duplicadas. */
export function urlDelSitio(ruta) {
  return `${env.sitioUrl.replace(/\/+$/, '')}/${String(ruta).replace(/^\/+/, '')}`
}
