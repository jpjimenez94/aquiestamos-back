import { env } from '../config/env.js'
import { RESPONSABLE } from '../consent/versions.js'

/**
 * La envoltura HTML de todos los correos.
 *
 * Es deliberadamente pobre: una tabla, estilos en línea y ninguna imagen.
 * Los clientes de correo ignoran hojas de estilo, bloquean imágenes remotas
 * por defecto y penalizan el HTML pesado. Un correo simple llega a la bandeja
 * de entrada; uno bonito llega a spam.
 *
 * Cada correo se manda en HTML y en texto plano. El texto no es un adorno:
 * es lo que ven los lectores de pantalla y lo que queda si el HTML falla.
 */

const COLOR_FONDO = '#f6f2ea'
const COLOR_TARJETA = '#ffffff'
const COLOR_TEXTO = '#2b2a26'
const COLOR_SUAVE = '#63625b'
const COLOR_MARCA = '#15162e'

/**
 * @param {object} p
 * @param {string} p.titulo      Encabezado dentro del correo.
 * @param {string[]} p.parrafos  Cada uno va en su propio <p>.
 * @param {{texto: string, url: string}} [p.boton]
 * @param {string[]} [p.datos]   Lista de "clave: valor" para el bloque gris.
 */
export function envolver({ titulo, parrafos, boton, datos }) {
  const cuerpo = parrafos
    .map(
      (t) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COLOR_TEXTO};">${t}</p>`,
    )
    .join('')

  const bloqueDatos = datos?.length
    ? `<table role="presentation" width="100%" style="margin:0 0 18px;background-color:${COLOR_FONDO};border-radius:10px;">
         <tr><td style="padding:14px 16px;">
           ${datos
             .map(
               (d) =>
                 `<div style="font-size:14px;line-height:1.7;color:${COLOR_TEXTO};">${d}</div>`,
             )
             .join('')}
         </td></tr>
       </table>`
    : ''

  const bloqueBoton = boton
    ? `<table role="presentation" style="margin:0 0 20px;">
         <tr><td style="background-color:${COLOR_MARCA};border-radius:8px;">
           <a href="${boton.url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#fff6eb;text-decoration:none;">${boton.texto}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${COLOR_SUAVE};">
         Si el botón no funciona, copia este enlace en tu navegador:<br>
         <a href="${boton.url}" style="color:${COLOR_SUAVE};">${boton.url}</a>
       </p>`
    : ''

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${COLOR_FONDO};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR_FONDO};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:${COLOR_TARJETA};border-radius:14px;overflow:hidden;">
        <tr><td style="background-color:${COLOR_MARCA};padding:18px 26px;">
          <span style="font-size:17px;font-weight:600;color:#fff6eb;">Red Aquí Estamos</span>
        </td></tr>
        <tr><td style="padding:26px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${COLOR_TEXTO};">${titulo}</h1>
          ${cuerpo}
          ${bloqueDatos}
          ${bloqueBoton}
        </td></tr>
        <tr><td style="padding:0 26px 24px;">
          <p style="margin:0;padding-top:16px;border-top:1px solid #e8e4dc;font-size:12px;line-height:1.6;color:${COLOR_SUAVE};">
            Este correo es parte del funcionamiento de la red; no es publicidad.
            Puedes pedirnos conocer, actualizar o eliminar tus datos, o retirar tu
            autorización, escribiendo a ${RESPONSABLE.canalHabeasData}.
          </p>
        </td></tr>
      </table>
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
