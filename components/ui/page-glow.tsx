/** Halo très léger en haut de page (cyan à gauche, rose à droite). Décoratif. */
export function PageGlow() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-80"
      style={{
        background:
          'radial-gradient(ellipse 55% 100% at 25% 0%, rgba(37,244,238,0.08), transparent 70%), radial-gradient(ellipse 45% 100% at 80% 0%, rgba(254,44,85,0.07), transparent 70%)',
      }}
      aria-hidden="true"
    />
  );
}
