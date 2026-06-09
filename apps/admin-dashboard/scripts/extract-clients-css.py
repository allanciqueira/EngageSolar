from pathlib import Path

src = Path(r"C:\ReservaAI\apps\admin-shell\styles.css")
lines = src.read_text(encoding="utf-8").splitlines()

# WhatsApp badge na lista + bloco premium completo de Clientes
ranges = [
    (30592, 30624),
    (30882, 30960),
    (32610, 34362),
]
chunks = []
for start, end in ranges:
    chunks.extend(lines[start:end])

out = "\n".join(chunks)
replacements = [
    ('.admin-page[data-admin-panel-active="clientes"]', 'body[data-es-panel-active="clientes"]'),
    ('.admin-panel[data-admin-panel="clientes"]', '.es-panel[data-es-panel="clientes"]'),
]
for old, new in replacements:
    out = out.replace(old, new)

dest = Path(__file__).resolve().parent.parent / "css" / "clients-reserva.css"
header = """/* Clientes — layout premium (extraído do ReservaAI admin-shell) */
body[data-es-panel-active="clientes"] .es-panel[data-es-panel="clientes"] {
  background: var(--ra-bg, #f5f7fb);
  padding: 18px;
  border: 0;
  box-shadow: none;
}

body[data-es-panel-active="clientes"] .es-content {
  background: var(--ra-bg, #f5f7fb);
}

"""
dest.write_text(header + out, encoding="utf-8")
print(f"wrote {len(chunks)} lines to {dest}")
