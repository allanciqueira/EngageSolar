# Deploy no servidor (docker-compose + Caddy)

## 1. Adicionar o serviço no `docker-compose.yml`

Coloque junto dos outros frontends (sem `ports` — só rede interna; o Caddy expõe 80/443):

```yaml
  vivaengage-admin-dashboard:
    image: allanciqueira/vivaengage-admin-dashboard:${TAG:-latest}
    container_name: vivaengage-admin-dashboard
    restart: unless-stopped
```

No serviço **`gateway`**, inclua em `depends_on`:

```yaml
    depends_on:
      - marketing-web
      - admin-shell
      # ... demais serviços ...
      - vivaengage-admin-dashboard
```

## 2. Porta distinta no host (opcional — teste antes do Caddy)

Se quiser acessar direto por IP:porta (ex.: `http://servidor:8088`):

```yaml
  vivaengage-admin-dashboard:
    image: allanciqueira/vivaengage-admin-dashboard:${TAG:-latest}
    container_name: vivaengage-admin-dashboard
    restart: unless-stopped
    ports:
      - "8088:80"
```

Depois que o domínio estiver no Caddy, pode remover o bloco `ports`.

## 3. Caddyfile — `https://www.engagesolar.com.br`

No **final** do `Caddyfile.platform`, **fora** de `(platform_routes)` e fora do bloco `{$APP_DOMAIN:reservaai.ia.br}`:

```caddy
engagesolar.com.br {
  redir https://www.engagesolar.com.br{uri} permanent
}

www.engagesolar.com.br {
  encode gzip

  reverse_proxy vivaengage-admin-dashboard:80 {
    header_down Cache-Control "no-cache, max-age=0, must-revalidate"
  }
}
```

O Caddy emite HTTPS automaticamente (Let's Encrypt) se:

- DNS de `www` e do apex apontar para o IP do servidor
- Portas 80 e 443 estiverem abertas (já expostas no `gateway`)

Arquivo **completo** (ReservaAI + Engage): `docs/Caddyfile.production.full`  
Só o bloco Engage: `docs/caddy-engagesolar.com.br.caddyfile`

Recarregar após editar:

```bash
docker compose exec gateway caddy reload --config /etc/caddy/Caddyfile
# ou
docker compose restart gateway
```

## 4. Publicar imagem (sua máquina)

```bat
cd C:\EngageSolar
build_push.cmd
```

## 5. No servidor

```bash
docker compose pull vivaengage-admin-dashboard
docker compose up -d vivaengage-admin-dashboard
# se alterou Caddyfile:
docker compose up -d gateway
```

Health interno: `docker compose exec vivaengage-admin-dashboard wget -qO- http://127.0.0.1/health`

## CORS (WhatsApp inbox + Configurações + WhatsApp API)

O front em `https://www.engagesolar.com.br` chama APIs no **mesmo host** (`/api/operator`, `/api/messaging`). O browser ainda exige CORS nos `POST` com `Authorization` (ex.: upload de foto do perfil WhatsApp).

| Rota | Serviço | Uso no Engage |
|------|---------|----------------|
| `/api/operator/meta-whatsapp/*` | **operator-service** | Configurações → **WhatsApp API** (perfil, foto, verticals) |
| `/api/operator/*` | operator-service | Empresa, equipe, KB, pagamentos… |
| `/api/messaging/*` | messaging-service | Inbox WhatsApp |
| `/api/audit/*` | audit-service | Auditoria |
| `/engage/*` | api-engage (NeuraFlow) | Campanhas, meta connections (Caddy → `api-engage:3000`) |
| `/api/operator/engage/*` | operator-service → api-engage | BFF campanhas (fallback) |

### Campanhas Engage — variáveis do `operator-service`

Se `/api/operator/engage/*` retornar **503**, o BFF não consegue falar com o api-engage. Configure no compose (`.env.prod`):

```env
# Preferencial quando api-engage está na mesma rede Docker:
PLATFORM_ENGAGE_BASE_URL=http://api-engage:3000

# Fallback se rotas internas ainda exigirem platform admin na NeuraFlow:
PLATFORM_SERVICE_AUTH_USERNAME=...
PLATFORM_SERVICE_AUTH_PASSWORD=...
```

O front tenta primeiro `/engage/...` (Caddy direto) e depois `/api/operator/engage/...`.

Domínios no Java (`services/operator-service/.../WebConfig.java`):

- `https://www.engagesolar.com.br`
- `https://engagesolar.com.br`
- `http://localhost:5173` (dev)

**Não precisa alterar o gateway/Caddy** — só rebuild + redeploy do `operator-service`.

### Publicar operator-service (obrigatório para WhatsApp API)

Na máquina de build (`C:\ReservaAI`):

```bat
docker login
cd C:\ReservaAI
:: só operator (rápido):
docker build -f services/operator-service/Dockerfile -t reservaai-operator-service:latest services/operator-service
docker tag reservaai-operator-service:latest allanciqueira/reservaai-operator-service:latest
docker push allanciqueira/reservaai-operator-service:latest
```

Ou o pacote completo: `go_docker.cmd` (linhas do `operator-service`).

No servidor:

```bash
docker compose pull operator-service
docker compose up -d operator-service
```

### WhatsApp API — checklist

1. **Canal WhatsApp ativo** no tenant (onboarding concluído) — senão `GET business-profile` retorna 404.
2. **Usuário ADMIN/OWNER** ou `managedTenant` — senão a tela fica só leitura.
3. **operator-service** em produção com CORS Engage (redeploy acima).
4. **Dashboard Engage** publicado (`build_push.cmd`).
5. Handoff NeuraFlow: `ReservaAI/docs/integration/HANDOFF-RESERVAAI-WHATSAPP-BUSINESS-PROFILE.md`

Endpoints usados pelo front:

- `GET /api/operator/meta-whatsapp/business-profile/verticals`
- `GET /api/operator/meta-whatsapp/business-profile?tenantId=`
- `PUT /api/operator/meta-whatsapp/business-profile?tenantId=`
- `POST /api/operator/meta-whatsapp/business-profile/profile-picture?tenantId=` (multipart, campo `image`)
