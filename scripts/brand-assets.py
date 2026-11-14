"""
Logo définitif de Tracktout : tous les fichiers de marque sont tirés de l'image fournie (docs/brand/logo-source.jpg),
sans la redessiner. Deux seules opérations sur l'image : recadrer (retirer les morceaux d'interface en bas) et rendre
le fond blanc transparent. Les aplats gardent leurs pixels d'origine ; seuls les bords lissés (mélange avec le fond)
reçoivent une transparence partielle, avec leur couleur « démélangée » du fond pour éviter un liseré blanc.

    python3 scripts/brand-assets.py

Produit :
- public/brand/tracktout-logo.png        logo complet, fond transparent, pleine définition
- public/brand/tracktout-logo-480.png    le même en 480 px de large (site, appli, e-mails)
- public/brand/tracktout-icone-512.png   le T fléché seul, carré 512 px, fond transparent (favicon, Stripe…)
- public/brand/tracktout-icone-128.png   le même en 128 px (icône de l'appli dans la barre latérale)
- app/icon.png                           favicon (T fléché, 512 px, transparent)
- app/apple-icon.png                     180 px, T fléché sur fond blanc (iOS n'accepte pas la transparence)
- public/icons/icon-192.png, icon-512.png    appli installable (« any ») : carré blanc arrondi, T fléché
- public/icons/icon-maskable-512.png     « maskable » : fond blanc plein, T dans la zone sûre
- public/icons/badge-96.png              badge des notifications Android (silhouette blanche du T, obligatoire)
- public/icons/splash/*.png              écrans de démarrage iOS : fond blanc, logo complet
- lib/brand-images.ts                    logo et T en data URI pour les images de partage (next/og)

Demande numpy et Pillow.
"""
import base64
import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "brand" / "logo-source.jpg"
BRAND = ROOT / "public" / "brand"
ICONS = ROOT / "public" / "icons"
SPLASH = ICONS / "splash"

# Mesures sur l'image fournie (voir docs/brand) : fond quasi blanc, deux couleurs pleines.
MARGIN = 24  # marge transparente autour du logo recadré
NOISE = 14  # en dessous de cette distance au fond : du fond (bruit de compression JPEG)
OPAQUE = 0.96  # au-dessus de cette proportion de couleur : pixel d'origine, opaque
WHITE = (255, 255, 255, 255)

SPLASH_SCREENS = [
    (440, 956, 3),
    (402, 874, 3),
    (430, 932, 3),
    (393, 852, 3),
    (428, 926, 3),
    (390, 844, 3),
    (375, 812, 3),
    (414, 896, 2),
    (375, 667, 2),
]


def load():
    rgb = np.asarray(Image.open(SOURCE).convert("RGB")).astype(np.float64)
    h, w, _ = rgb.shape
    # Fond : médiane des bords hauts et latéraux (hors logo).
    border = np.concatenate([rgb[:40].reshape(-1, 3), rgb[:, :40].reshape(-1, 3), rgb[:, -40:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(-1))
    strong = dist > 80
    # Le logo est le premier bloc de lignes ; les morceaux d'interface viennent après une bande vide.
    rows = np.where(strong.any(1))[0]
    top, bottom = rows[0], rows[0]
    for r in rows[1:]:
        if r > bottom + 30:
            break
        bottom = r
    cols = np.where(strong[top : bottom + 1].any(0))[0]
    box = (max(0, cols[0] - MARGIN), max(0, top - MARGIN), min(w, cols[-1] + 1 + MARGIN), min(h, bottom + 1 + MARGIN))
    return rgb, bg, dist, box


def foreground_colors(rgb, dist):
    """Les deux couleurs pleines du logo (rose et encre), mesurées au cœur des aplats."""
    solid = rgb[dist > 200]
    rose = np.median(solid[(solid[:, 0] > 150) & (solid[:, 1] < 90)], axis=0)
    ink = np.median(solid[solid.sum(1) < 160], axis=0)
    return {"rose": rose, "encre": ink}


def matte(rgb, bg, dist, colors):
    """Alpha = part de couleur du logo dans chaque pixel (projection sur fond → couleur). Aplats intacts."""
    h, w, _ = rgb.shape
    diff = rgb - bg
    best_alpha = np.zeros((h, w))
    best_err = np.full((h, w), np.inf)
    label = np.zeros((h, w), dtype=np.int8)
    for i, color in enumerate(colors.values()):
        v = color - bg
        t = (diff @ v) / (v @ v)
        err = ((diff - t[..., None] * v) ** 2).sum(-1)
        better = err < best_err
        best_err = np.where(better, err, best_err)
        best_alpha = np.where(better, t, best_alpha)
        label = np.where(better, i, label)
    alpha = np.clip(best_alpha, 0, 1)
    alpha[dist < NOISE] = 0
    opaque = alpha >= OPAQUE
    out = np.empty((h, w, 4))
    # Bords : couleur démélangée du fond ; aplats : pixel d'origine, sans retouche.
    safe = np.maximum(alpha, 1e-6)[..., None]
    unmixed = np.clip(bg + diff / safe, 0, 255)
    out[..., :3] = np.where(opaque[..., None], rgb, unmixed)
    out[..., 3] = np.where(opaque, 1.0, alpha) * 255
    out[alpha == 0] = 0
    return out, label


def components(mask):
    """Étiquettes de composantes connexes (4-voisinage), sans dépendance à scipy."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    current = 0
    for y, x in zip(*np.nonzero(mask)):
        if labels[y, x]:
            continue
        current += 1
        stack = [(y, x)]
        labels[y, x] = current
        while stack:
            cy, cx = stack.pop()
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = current
                    stack.append((ny, nx))
    return labels, current


def dilate(mask, radius):
    out = mask.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def to_image(arr):
    return Image.fromarray(np.round(arr).astype(np.uint8), "RGBA")


def trim(img, pad=0):
    box = img.getchannel("A").getbbox()
    img = img.crop(box)
    if pad:
        canvas = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
        canvas.paste(img, (pad, pad))
        img = canvas
    return img


def fit_square(mark, size, ratio, background=None, radius=0):
    """Le T fléché centré dans un carré, à `ratio` du côté, sur fond transparent ou uni."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if background:
        ImageDraw.Draw(canvas).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=background)
    side = int(size * ratio)
    scale = side / max(mark.width, mark.height)
    resized = mark.resize((max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - resized.width) // 2, (size - resized.height) // 2))
    return canvas


def resize_width(img, width):
    return img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)


def save(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {img.width}×{img.height}")


def data_uri(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def main():
    rgb, bg, dist, (x0, y0, x1, y1) = load()
    colors = foreground_colors(rgb, dist)
    print(f"Fond {bg.round().astype(int).tolist()}, rose {colors['rose'].round().astype(int).tolist()}, "
          f"encre {colors['encre'].round().astype(int).tolist()}, recadrage x {x0}–{x1}, y {y0}–{y1}")
    rgb, dist = rgb[y0:y1, x0:x1], dist[y0:y1, x0:x1]
    rgba, label = matte(rgb, bg, dist, colors)

    logo = to_image(rgba)
    save(logo, BRAND / "tracktout-logo.png")
    logo480 = resize_width(logo, 480)
    save(logo480, BRAND / "tracktout-logo-480.png")

    # T fléché : composantes roses qui commencent à gauche du « r » (les lettres « tout » sont bien plus à droite).
    alpha = rgba[..., 3]
    rose_core = (label == 0) & (alpha > 128)
    labels, count = components(rose_core)
    keep = np.zeros_like(rose_core)
    width = rose_core.shape[1]
    for i in range(1, count + 1):
        ys, xs = np.nonzero(labels == i)
        if xs.min() < width * 0.2 and len(xs) > 500:
            keep |= labels == i
    region = dilate(keep, 3) & (label == 0)
    mark_arr = rgba.copy()
    mark_arr[~region] = 0
    mark = trim(to_image(mark_arr))

    icon512 = fit_square(mark, 512, 0.9)
    save(icon512, BRAND / "tracktout-icone-512.png")
    save(fit_square(mark, 128, 0.9), BRAND / "tracktout-icone-128.png")
    save(icon512, ROOT / "app" / "icon.png")
    save(fit_square(mark, 180, 0.72, WHITE), ROOT / "app" / "apple-icon.png")
    for px in (192, 512):
        save(fit_square(mark, px, 0.66, WHITE, radius=round(px * 0.22)), ICONS / f"icon-{px}.png")
    save(fit_square(mark, 512, 0.56, WHITE), ICONS / "icon-maskable-512.png")
    # Badge Android : silhouette blanche (Android n'affiche que la transparence du badge).
    sil = fit_square(mark, 96, 0.8)
    sil_arr = np.asarray(sil).copy()
    sil_arr[..., :3] = 255
    save(Image.fromarray(sil_arr, "RGBA"), ICONS / "badge-96.png")

    for w, h, dpr in SPLASH_SCREENS:
        W, H = w * dpr, h * dpr
        canvas = Image.new("RGBA", (W, H), WHITE)
        art = resize_width(logo, round(W * 0.62))
        canvas.alpha_composite(art, ((W - art.width) // 2, (H - art.height) // 2))
        save(canvas.convert("RGB"), SPLASH / f"splash-{W}x{H}.png")

    module = ROOT / "lib" / "brand-images.ts"
    module.write_text(
        "/**\n * Logo de Tracktout pour les images de partage (next/og lit les images en data URI, sans accès au disque).\n"
        " * Généré par `python3 scripts/brand-assets.py` à partir de docs/brand/logo-source.jpg : ne pas modifier à la main.\n */\n"
        f"export const LOGO_DATA_URI =\n  '{data_uri(resize_width(logo, 720))}';\n"
        f"export const LOGO_RATIO = {logo.width / logo.height:.4f};\n"
        f"export const MARK_DATA_URI =\n  '{data_uri(fit_square(mark, 256, 1.0))}';\n",
        encoding="utf-8",
    )
    print(f"  {module.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
