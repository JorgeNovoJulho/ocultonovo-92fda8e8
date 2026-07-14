/**
 * Paquete de idioma Español — carga bajo demanda.
 * Las claves faltantes caen automáticamente a PT-BR vía t().
 */
const dict: Record<string, string> = {
  "language.label": "Idioma",
  "language.pt": "Portugués",
  "language.en": "Inglés",
  "language.es": "Español",
  "language.download": "Descargar paquete {lang}",
  "language.downloading": "Descargando paquete {lang}…",
  "language.downloaded": "Paquete {lang} listo",
  "language.downloadFailed": "Error al descargar el paquete",
  "language.installed": "Instalado",
  "language.available": "Tocar para descargar",
  "language.error": "Falló la descarga — tocar para reintentar",
  "language.changedTo": "Idioma cambiado a {lang}",

  "suggestions.title": "Explorar nuevos misteriosos(as)",
  "suggestions.viewAll": "Explorar nuevos misteriosos(as)",
  "suggestions.dismiss": "Descartar sugerencia",
  "suggestions.prev": "Anterior",
  "suggestions.next": "Siguiente",
  "suggestions.viewProfile": "Ver perfil de {name}",
  "suggestions.mutual": "{count} siguiendo en común",
  "suggestions.affinity": "{count} afinidades",
  "suggestions.newProfile": "Nuevo perfil",
  "suggestions.follow": "Añadir",
  "suggestions.following": "Siguiendo",
  "suggestions.adminDescription":
    'Configura la sección "Explorar nuevos misteriosos(as)" y el precio del destaque dorado.',

  "feed.tabs.following": "Siguiendo",
  "feed.tabs.foryou": "Destacados del Feed",
  "feed.tabs.vip": "Mi Contenido VIP",
  "feed.tabs.card": "Modo Tarjeta",
  "feed.empty.posts": "Aún no hay publicaciones",
  "feed.empty.following": "No hay publicaciones de a quienes sigues",

  "stories.your": "Tu Historia",
  "stories.empty": "No hay historias disponibles",
  "stories.user.fallback": "Usuario",

  "header.beta": "BETA",
  "header.search": "Buscar",
  "header.notifications": "Notificaciones",
  "header.theme": "Tema",

  "nav.home": "Inicio",
  "nav.radar": "Radar",
  "nav.aura": "Aura",
  "nav.alerts": "Alertas",
  "nav.chat": "Chat",
  "nav.you": "Tú",
  "nav.menu": "Menú",
  "nav.explore": "Explorar",
  "nav.messages": "Mensajes",

  "action.follow": "Seguir",
  "action.following": "Siguiendo",
  "action.unfollow": "Dejar de seguir",
  "action.like": "Me gusta",
  "action.liked": "Te gusta",
  "action.comment": "Comentar",
  "action.share": "Compartir",
  "action.save": "Guardar",
  "action.saved": "Guardado",
  "action.send": "Enviar",
  "action.cancel": "Cancelar",
  "action.confirm": "Confirmar",
  "action.close": "Cerrar",
  "action.delete": "Eliminar",
  "action.edit": "Editar",
  "action.loading": "Cargando…",
  "action.retry": "Reintentar",

  "toast.copied": "Copiado al portapapeles",
  "toast.saved": "Guardado con éxito",
  "toast.error.generic": "Algo salió mal. Inténtalo de nuevo.",
  "toast.error.network": "Sin conexión. Revisa tu internet.",
  "toast.success.generic": "¡Todo listo!",
};

export default dict;
