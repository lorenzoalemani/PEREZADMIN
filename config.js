/* ═══════════════════════════════════════════════════════
   CONFIGURACIÓN DE LA NUBE (Supabase)

   Mientras SUPABASE_ANON_KEY esté vacío, la app funciona en
   MODO LOCAL: no pide login y guarda solo en este navegador.
   Sirve para probar sin tocar los datos reales.

   Para activar login + sincronización:
   1. Completá SUPABASE_URL y SUPABASE_ANON_KEY (la clave "anon"
      o "publishable", NUNCA la "service_role" / "secret").
   2. Seguí los pasos de LEEME.md (usuarios y permisos del bucket).
═══════════════════════════════════════════════════════ */
window.PB_CONFIG = {
  SUPABASE_URL:      'https://ilvrimfxqivxtxyesdov.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlsdnJpbWZ4cWl2eHR4eWVzZG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODM4MzgsImV4cCI6MjEwNzU1OTgzOH0.Cy2jU7MhjpNxXT8c3COi-Tez0-X9mferr0j-InWWo3U',
  BUCKET:            'perez-burger',
  // Si el usuario escribe "juan" (sin @) se completa como juan@perezburger.app
  USER_EMAIL_DOMAIN: 'perezburger.app',
};
