"""Extrai painéis e CSS de Configurações do ReservaAI para o Engage Solar."""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent.parent
RESERVA_ADMIN = Path(r"C:\ReservaAI\apps\admin-shell")
RESERVA_OPERATOR = Path(r"C:\ReservaAI\apps\operator-mf")
INDEX = ROOT / "index.html"
ADMIN_HTML = RESERVA_ADMIN / "admin.html"
ADMIN_CSS = RESERVA_ADMIN / "styles.css"

PANEL_RANGES = [
    ("plano-uso", 1025, 1293),
    ("servicos", 3373, 3489),
    ("profissionais", 3490, 3531),
    ("configuracoes-operador", 3532, 4267),
    ("informacoes-adicionais", 4268, 4358),
    ("whatsapp-api", 4359, 4562),
    ("usuarios", 4668, 4914),
    ("auditoria", 6009, 6071),
]

# Blocos do admin-shell/styles.css necessários ao layout premium (sem marketing/hero)
ADMIN_CSS_RANGES = [
    (12919, 13215),  # admin-inline-status + auditoria (sem calendário)
    (19114, 19696),  # operator-config estrutural (listas, filiais, tabs internas)
    (26714, 27350),  # members table
    (30973, 32528),  # :root --ra-* + profissionais + usuarios + pro-tabs
    (38729, 41355),  # servicos + wa-api + config-pro premium + tenant-kb
    (45197, 46709),  # POS / pagamentos no config operador
    (49101, 55441),  # plano e uso
    (41429, 41807),  # empresa → geral (company-geral-pro)
]

JS_COPY = [
    (RESERVA_ADMIN / "components" / "modal.js", ROOT / "js" / "components" / "modal.js"),
    (RESERVA_ADMIN / "components" / "table.js", ROOT / "js" / "components" / "table.js"),
    (RESERVA_ADMIN / "pages" / "members.js", ROOT / "js" / "pages" / "members.js"),
    (RESERVA_ADMIN / "admin-audit.js", ROOT / "js" / "admin-audit.js"),
    (RESERVA_ADMIN / "pos-payments-config.js", ROOT / "js" / "pos-payments-config.js"),
    (RESERVA_ADMIN / "pos-terminals-admin.js", ROOT / "js" / "pos-terminals-admin.js"),
    (RESERVA_OPERATOR / "operator-special-dates.js", ROOT / "js" / "operator-special-dates.js"),
    (RESERVA_OPERATOR / "config-admin.js", ROOT / "js" / "config-admin.js"),
    (RESERVA_ADMIN / "tenant-knowledge-lib.js", ROOT / "js" / "tenant-knowledge-lib.js"),
    (RESERVA_ADMIN / "tenant-knowledge-admin.js", ROOT / "js" / "tenant-knowledge-admin.js"),
    (RESERVA_ADMIN / "whatsapp-business-profile-admin.js", ROOT / "js" / "whatsapp-business-profile-admin.js"),
    (RESERVA_ADMIN / "tenant-users-admin.js", ROOT / "js" / "tenant-users-admin.js"),
    (RESERVA_ADMIN / "plano-uso-admin.js", ROOT / "js" / "plano-uso-admin.js"),
    (RESERVA_ADMIN / "audit-admin.js", ROOT / "js" / "audit-admin.js"),
    (RESERVA_ADMIN / "service-packages-admin.js", ROOT / "js" / "service-packages-admin.js"),
    (RESERVA_ADMIN / "tenant-company-admin.js", ROOT / "js" / "tenant-company-admin.js"),
]


def postprocess_css(text: str) -> str:
    text = text.replace(
        '.admin-page[data-admin-panel-active="',
        'body[data-es-panel-active="',
    )
    text = text.replace(
        '.admin-panel[data-admin-panel="',
        '.es-panel--settings[data-es-panel="',
    )
    text = re.sub(r"^body\s*\{[^}]*\}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^:root\s*\{[^}]*\}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\*\s*\{[^}]*\}\s*", "", text, flags=re.MULTILINE)
    # Evita btn-ghost de marketing (texto branco) vazando nos painéis
    text = re.sub(
        r"\.btn-ghost\s*\{[^}]*color:\s*#f3f8ff[^}]*\}",
        ".btn-ghost {\n  border: 1px solid var(--ra-border, #e2e8f0);\n  color: var(--ra-text, #0f172a);\n  background: var(--ra-surface, #fff);\n}",
        text,
        flags=re.IGNORECASE,
    )
    return text


def transform_panel_html(chunk: str) -> str:
    chunk = chunk.replace('data-admin-panel="', 'data-es-panel="')
    chunk = re.sub(
        r'<section class="admin-panel[^"]*"',
        '<section class="es-panel es-panel--settings"',
        chunk,
        count=1,
    )
    return chunk


def extract_panels() -> str:
    lines = ADMIN_HTML.read_text(encoding="utf-8").splitlines()
    parts = []
    for _panel_id, start, end in PANEL_RANGES:
        block = "\n".join(lines[start - 1 : end])
        parts.append(transform_panel_html(block))
    return "\n".join(parts)


def extract_admin_css() -> str:
    lines = ADMIN_CSS.read_text(encoding="utf-8").splitlines()
    chunks = []
    seen = set()
    for start, end in ADMIN_CSS_RANGES:
        key = (start, end)
        if key in seen:
            continue
        seen.add(key)
        chunks.append("\n".join(lines[start - 1 : end]))
    return postprocess_css("\n\n".join(chunks))


def patch_index_panels(panels_html: str) -> None:
    index = INDEX.read_text(encoding="utf-8")
    start_marker = 'data-es-panel="plano-uso"'
    end_marker = 'data-es-panel="auditoria"'
    if start_marker not in index or end_marker not in index:
        raise SystemExit("Painéis de settings não encontrados em index.html")
    start = index.index("<section", index.index(start_marker) - 80)
    end = index.index("</section>", index.index(end_marker)) + len("</section>")
    INDEX.write_text(index[:start] + panels_html + index[end:], encoding="utf-8")


def main():
    panels_html = extract_panels()
    (ROOT / "partials" / "settings-panels.html").write_text(panels_html, encoding="utf-8")
    patch_index_panels(panels_html)
    print("index.html panels ok")

    extras = ROOT / "css" / "settings-reserva.css"
    extras.write_text(
        "/* Layout ReservaAI — painéis Configurações (Engage) */\n" + extract_admin_css(),
        encoding="utf-8",
    )
    print("wrote", extras.name, extras.stat().st_size)

    # Remover bundle legado que sobrescrevia o layout premium
    legacy = ROOT / "css" / "settings-operator.css"
    if legacy.exists():
        legacy.unlink()
        print("removed settings-operator.css")

    for src, dst in JS_COPY:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)

    print("done")


if __name__ == "__main__":
    main()
