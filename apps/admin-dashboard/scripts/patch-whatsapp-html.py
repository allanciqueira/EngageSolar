"""Injeta markup do inbox WhatsApp no index.html do Engage Solar."""
from pathlib import Path

ADMIN = Path(r"C:\ReservaAI\apps\admin-shell\admin.html")
INDEX = Path(__file__).resolve().parent.parent / "index.html"

html = ADMIN.read_text(encoding="utf-8")
start = html.index('<div class="whats-pro-shell" id="botInboxRoot">')
end = html.index("</section>", start)
# fecha no </section> do painel bot-whatsapp — pegar até </div> antes do </section>
# O bloco termina em </div>\n          </section> após botInboxCrm
end = html.index("            </div>\n          </section>", start) + len("            </div>")
inbox_inner = html[start:end]

panel = f"""          <section class="es-panel es-panel--conversas" data-es-panel="conversas" hidden>
            <div class="whats-pro-card">
{inbox_inner}
            </div>
          </section>"""

index = INDEX.read_text(encoding="utf-8")
old = """          <section class="es-panel" data-es-panel="conversas" hidden>
            <div class="es-placeholder"><strong>Conversas</strong><br />Inbox WhatsApp — Fase 2.</div>
          </section>"""
if old not in index:
    raise SystemExit("Placeholder conversas não encontrado em index.html")
INDEX.write_text(index.replace(old, panel), encoding="utf-8")
print("index.html patched, inbox chars:", len(inbox_inner))
