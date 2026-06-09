"""Extrai bloco whats-pro do ReservaAI admin-shell para css/whatsapp.css."""
from pathlib import Path

SRC = Path(r"C:\ReservaAI\apps\admin-shell\styles.css")
OUT = Path(__file__).resolve().parent.parent / "css" / "whatsapp.css"

lines = SRC.read_text(encoding="utf-8").splitlines()
chunk = "\n".join(lines[20182:21821])

engage = """
/* Engage Solar — painel Conversas */
body[data-es-panel-active="conversas"] .es-header,
body[data-es-panel-active="conversas"] .es-page-heading { display: none; }
body[data-es-panel-active="conversas"] .es-main { display: flex; flex-direction: column; min-height: 100vh; }
body[data-es-panel-active="conversas"] .es-content {
  margin-top: 0;
  padding: 0.75rem 1rem 1rem;
  border-radius: 1.15rem 1.15rem 0 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}
.es-panel--conversas {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.es-panel--conversas .whats-pro-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 5.5rem);
  max-height: calc(100vh - 5.5rem);
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(206, 217, 232, 0.85);
  background: #f0f2f5;
  box-shadow: 0 18px 36px rgba(36, 65, 121, 0.08);
}
.es-panel--conversas .whats-pro-shell { flex: 1; min-height: 0; }
@media (max-width: 820px) {
  body[data-es-panel-active="conversas"] .es-panel--conversas .whats-pro-card {
    height: calc(100vh - 4.5rem);
    max-height: calc(100vh - 4.5rem);
  }
}
"""

OUT.write_text("/* WhatsApp inbox — ReservaAI admin-shell */\n" + chunk + engage, encoding="utf-8")
print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")
