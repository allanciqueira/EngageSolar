# Engage Solar

Plataforma de relacionamento, automação WhatsApp e recuperação de vendas para **energia solar**.

Projeto **independente** do ReservaAI — reutiliza os mesmos padrões de layout (sidebar, cards, dashboard responsivo), com identidade visual e KPIs focados em vendas solares.

## MVP (Fase 1)

Dashboard estático com dados mockados:

- Resumo comercial (6 KPIs)
- Pipeline de vendas (funil)
- WhatsApp — resumo do dia
- Insights IA
- Campanhas ativas
- Ranking de vendedores
- Resumo financeiro

## Rodar localmente

```bash
cd apps/admin-dashboard
npx --yes serve -l 5173
```

Abra [http://localhost:5173](http://localhost:5173).

## Estrutura

```
EngageSolar/
├── apps/admin-dashboard/   # Front estático (MVP)
├── docs/                   # Branding e roadmap
└── README.md
```

## Git

Repositório novo — inicialize o remoto quando criar no GitHub/GitLab:

```bash
git init
git add .
git commit -m "feat: MVP dashboard Engage Solar"
git remote add origin <url-do-repo>
git push -u origin main
```

## Roadmap

Ver [docs/roadmap.md](docs/roadmap.md).

## Relação com ReservaAI

| ReservaAI | Engage Solar |
|-----------|--------------|
| Gestão operacional (salão, agenda, POS) | CRM + WhatsApp + vendas solares |
| Azul operacional | Azul petróleo + amarelo solar |
| Cockpit / Home premium | Dashboard comercial |

Backend e microfrontends podem ser adicionados nas fases 2–4 replicando a arquitetura do ReservaAI quando houver API própria.
