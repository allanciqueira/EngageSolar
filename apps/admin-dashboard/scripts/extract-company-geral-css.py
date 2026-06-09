from pathlib import Path

src = Path(r"C:\ReservaAI\apps\admin-shell\styles.css")
lines = src.read_text(encoding="utf-8").splitlines()

# Empresa → Geral — cadastro da empresa (premium)
ranges = [(41429, 41807)]
chunks = []
for start, end in ranges:
    chunks.extend(lines[start:end])

out = "\n".join(chunks)
out = out.replace(
    '.admin-page[data-admin-panel-active="',
    'body[data-es-panel-active="',
)

dest = Path(__file__).resolve().parent.parent / "css" / "company-geral-reserva.css"
header = """/* Empresa → Geral — layout premium (extraído do ReservaAI admin-shell) */
body[data-es-panel-active="configuracoes-operador"] .es-panel[data-es-panel="configuracoes-operador"] {
  background: var(--ra-bg, #f5f7fb);
}

"""
dest.write_text(header + out, encoding="utf-8")
print(f"wrote {len(chunks)} lines to {dest}")
