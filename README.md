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

No PowerShell, a partir da raiz do repositório **EngageSolar**:

**Pré-requisito:** stack ReservaAI no gateway local (**porta 8080**), ex. `docker compose` em `C:\ReservaAI`.

```powershell
cd C:\EngageSolar\apps\admin-dashboard
npm run dev
# ou no Windows, se a porta 5173 estiver ocupada pelo serve:
.\start-dev.cmd
```

Isso sobe UI em **5173** e faz **proxy** de `/api/*`, `/oauth2/*` e `/login/oauth2/*` para `http://localhost:8080` (mesmo contrato do ReservaAI).

Abra [http://localhost:5173/login.html](http://localhost:5173/login.html) — tenant fixo **Dmetc**.

> Não use `npx serve` sozinho: ele não encaminha API e as chamadas ficam em `localhost:5173/api/identity/...` sem backend.

### Login (tenant Dmetc)

- Tenant: `096029c3-f6db-43af-a55a-fc7df608732f` — empresa **Dmetc** (`js/config.js`)
- API: `/api/identity` (proxy no Caddy do domínio Engage Solar)
- Após login → dashboard (`index.html`); botão **Sair** na sidebar

> O dashboard **não** fica no monorepo ReservaAI — apenas em `C:\EngageSolar`.

## Docker (servidor)

Build e execução direto na pasta do dashboard:

```powershell
cd C:\EngageSolar\apps\admin-dashboard
docker build -t engage-solar/admin-dashboard:latest .
docker run -d --name engage-solar-dashboard -p 8080:80 --restart unless-stopped engage-solar/admin-dashboard:latest
```

Ou, na raiz do repositório, com Compose:

```powershell
cd C:\EngageSolar
docker compose up -d --build
```

- **URL local:** [http://localhost:8080](http://localhost:8080)
- **Health check:** `http://localhost:8080/health`
- **Imagem:** `engage-solar/admin-dashboard:latest`

### Publicar no Docker Hub (mesmo fluxo do ReservaAI)

Na raiz `C:\EngageSolar`:

```bat
build_push.cmd
```

Isso gera e envia: **`allanciqueira/vivaengage-admin-dashboard:latest`**

### No servidor (após o push)

```bash
docker pull allanciqueira/vivaengage-admin-dashboard:latest
docker run -d --name vivaengage-dashboard -p 80:80 --restart unless-stopped allanciqueira/vivaengage-admin-dashboard:latest
```

Health: `http://SEU_HOST/health`

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
