from pathlib import Path

src = Path(r"C:\ReservaAI\apps\admin-shell\styles.css")
lines = src.read_text(encoding="utf-8").splitlines()

# Shared engage-config UI (head, buttons, tables, skeleton) + campaign dashboard
ranges = [
    (55909, 56145),
    (56210, 56420),
]
chunks = []
for start, end in ranges:
    chunks.extend(lines[start:end])

out = "\n".join(chunks)
out = out.replace(
    '.admin-page[data-admin-panel-active="engage-campaigns"]',
    'body[data-es-panel-active="campanhas"]',
)
out = out.replace(
    '.admin-page[data-admin-panel-active="engage-campaigns"] .admin-content',
    'body[data-es-panel-active="campanhas"] .es-content',
)
out = out.replace(
    'body[data-es-panel-active="campanhas"] .admin-panel[data-admin-panel="engage-campaigns"].card',
    'body[data-es-panel-active="campanhas"] .es-panel[data-es-panel="campanhas"]',
)
out = out.replace(
    'body[data-es-panel-active="campanhas"] .admin-content',
    'body[data-es-panel-active="campanhas"] .es-content',
)

dest = Path(__file__).resolve().parent.parent / "css" / "engage-campaigns-reserva.css"
header = """/* Engage — Dashboard de campanhas (extraído do ReservaAI admin-shell) */

body[data-es-panel-active="campanhas"] .es-page-heading {
  display: none !important;
}

body[data-es-panel-active="campanhas"] .es-content {
  margin-top: -0.65rem;
  padding: 0;
  background: var(--es-bg, #f0f6ff);
  border-radius: 1.35rem 1.35rem 0 0;
  box-shadow: 0 -4px 24px rgba(11, 42, 91, 0.06);
  overflow: hidden;
}

body[data-es-panel-active="campanhas"] .es-panel[data-es-panel="campanhas"] {
  padding: 0;
  border: 0;
  box-shadow: none;
  background: var(--es-bg, #f0f6ff);
  min-height: 100%;
}

"""
dest.write_text(header + out, encoding="utf-8")
print(f"wrote {len(chunks)} lines to {dest}")
