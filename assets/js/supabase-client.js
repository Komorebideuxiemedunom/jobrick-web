/**
 * Initialise un client Supabase partage par toutes les pages.
 * Depend de config.js (chargé avant ce fichier) et du SDK Supabase (CDN).
 */
window.supabaseClient = supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

/**
 * Redirige vers index.html si personne n'est connecte.
 * A appeler en haut des pages qui exigent une session (dashboard.html).
 */
async function requireAuth() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}
