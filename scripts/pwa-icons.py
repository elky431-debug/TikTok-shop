"""
Icônes de l'appli installable (bloc 15), dessinées d'après le logo (app/icon.svg) : losange blanc avec le décalage
cyan / rose façon TikTok, sur fond noir. Relancer après un changement de logo :

    python3 scripts/pwa-icons.py

Produit :
- public/icons/icon-192.png, icon-512.png       (purpose « any » : carré noir aux coins arrondis)
- public/icons/icon-maskable-512.png            (purpose « maskable » : fond plein, logo dans la zone sûre de 80 %)
- public/icons/badge-96.png                     (badge des notifications Android : silhouette blanche sur transparent)
- app/apple-icon.png                            (180 × 180, fond plein : iOS arrondit lui-même)
- public/icons/splash/*.png                     (écrans de démarrage iOS, portrait)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "public" / "icons"
SPLASH = ICONS / "splash"
CYAN = (37, 244, 238, 255)
PINK = (254, 44, 85, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)
SCALE = 4  # sur-échantillonnage pour des bords lisses

# Losange du logo dans un repère 32 × 32 (components/brand/logo.tsx).
DIAMOND = [(16, 3.5), (27, 14), (16, 28.5), (5, 14)]


def diamond_points(cx, cy, size, dx=0.0, dy=0.0):
    k = size / 25.0  # le losange fait 22 × 25 dans le repère : on cale sur la hauteur
    return [((x - 16) * k + cx + dx * k, (y - 16) * k + cy + dy * k) for x, y in DIAMOND]


def draw_mark(img, cx, cy, size, glow=True):
    """Logo centré en (cx, cy), haut de `size` pixels (image déjà sur-échantillonnée)."""
    if glow:
        halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
        hd = ImageDraw.Draw(halo)
        r = size * 0.62
        hd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(37, 244, 238, 60))
        halo = halo.filter(ImageFilter.GaussianBlur(size * 0.18))
        img.alpha_composite(halo)
    d = ImageDraw.Draw(img)
    d.polygon(diamond_points(cx, cy, size, -1.4, -1.0), fill=CYAN)
    d.polygon(diamond_points(cx, cy, size, 1.4, 1.0), fill=PINK)
    d.polygon(diamond_points(cx, cy, size), fill=WHITE)


def save(img, path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.resize(size, Image.LANCZOS).save(path, optimize=True)


def icon_any(px):
    s = px * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BLACK)
    draw_mark(img, s / 2, s / 2, s * 0.68)
    return img


def icon_full(px, mark_ratio):
    s = px * SCALE
    img = Image.new("RGBA", (s, s), BLACK)
    draw_mark(img, s / 2, s / 2, s * mark_ratio)
    return img


def badge(px):
    s = px * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).polygon(diamond_points(s / 2, s / 2, s * 0.86), fill=WHITE)
    return img


# Écrans de démarrage iOS (portrait) : (largeur CSS, hauteur CSS, densité).
SPLASH_SCREENS = [
    (440, 956, 3),  # iPhone 16 Pro Max
    (402, 874, 3),  # iPhone 16 Pro
    (430, 932, 3),  # iPhone 14 Pro Max, 15/16 Plus, 15 Pro Max
    (393, 852, 3),  # iPhone 14 Pro, 15, 15 Pro, 16
    (428, 926, 3),  # iPhone 12/13 Pro Max, 14 Plus
    (390, 844, 3),  # iPhone 12, 13, 14
    (375, 812, 3),  # iPhone X, XS, 11 Pro, 12/13 mini
    (414, 896, 2),  # iPhone XR, 11
    (375, 667, 2),  # iPhone SE (2e et 3e génération), 8
]


def splash(w, h):
    k = 2  # sur-échantillonnage plus léger : ces images sont grandes
    img = Image.new("RGBA", (w * k, h * k), BLACK)
    draw_mark(img, w * k / 2, h * k / 2, min(w, h) * k * 0.28)
    return img


if __name__ == "__main__":
    save(icon_any(192), ICONS / "icon-192.png", (192, 192))
    save(icon_any(512), ICONS / "icon-512.png", (512, 512))
    save(icon_full(512, 0.5), ICONS / "icon-maskable-512.png", (512, 512))
    save(badge(96), ICONS / "badge-96.png", (96, 96))
    save(icon_full(180, 0.62), ROOT / "app" / "apple-icon.png", (180, 180))
    for w, h, dpr in SPLASH_SCREENS:
        save(splash(w * dpr, h * dpr), SPLASH / f"splash-{w * dpr}x{h * dpr}.png", (w * dpr, h * dpr))
    print("icônes écrites dans", ICONS)
