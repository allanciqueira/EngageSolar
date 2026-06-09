# SSL / Caddy — engagesolar.com.br

Sim: o **Caddy gera HTTPS sozinho** (Let's Encrypt) quando o site usa o hostname sem `http://` (como `www.engagesolar.com.br { ... }`).

Se o navegador diz que **não há certificado**, a emissão falhou ou o tráfego **não está chegando** no container `reservaai-gateway`.

## Checklist rápido

### 1. DNS

- `www.engagesolar.com.br` → **A** para o IP do servidor (ou CNAME correto).
- `engagesolar.com.br` (apex) → **A** para o mesmo IP.
- Aguarde propagação (minutos a algumas horas).

Teste no seu PC:

```bash
nslookup www.engagesolar.com.br
```

O IP deve ser o do servidor onde roda o Docker.

### 2. Cloudflare (muito comum)

Se o domínio usa **proxy laranja** (☁️):

- Let's Encrypt pode **não conseguir** validar pelo servidor.
- **Teste:** no painel DNS, coloque **DNS only** (cinza) em `www` e `@` por 10–15 min, reinicie o gateway e acesse de novo.
- Depois que o certificado existir, pode voltar o proxy (modo SSL recomendado: **Full (strict)** com certificado válido no origin).

### 3. Portas no servidor

```bash
sudo ss -tlnp | grep -E ':80|:443'
```

Só o **Caddy** (container `reservaai-gateway`) deve escutar 80 e 443 no host.

Firewall / security group da VPS: liberar **80** e **443** da internet.

### 4. Config montada e container certo

```bash
docker compose exec gateway caddy validate --config /etc/caddy/Caddyfile
docker compose restart gateway
docker compose logs gateway --tail 100
```

Procure linhas com `certificate obtained`, `acme`, `error`, `engagesolar`.

### 5. Volume de certificados

No compose, o gateway precisa de:

```yaml
volumes:
  - reservaai-caddy-data:/data
```

Sem isso, a cada recriação o Caddy tenta emitir de novo (rate limit).

### 6. Serviço do dashboard

```bash
docker compose ps vivaengage-admin-dashboard
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/ -H "Host: www.engagesolar.com.br"
```

(Se testar no host, o Caddy precisa estar escutando; melhor testar `https://www.engagesolar.com.br` de fora.)

## Teste HTTP antes do HTTPS

```bash
curl -I http://www.engagesolar.com.br
```

Deve redirecionar para `https://` (308/301). Se HTTP nem responde, problema é DNS/firewall, não SSL.

## Email ACME

No topo do Caddyfile:

```caddy
{
  email {$CADDY_EMAIL:admin@reservaai.ia.br}
}
```

Defina `CADDY_EMAIL` no `.env.prod` com um e-mail válido (avisos de expiração Let's Encrypt).

## Após corrigir

```bash
docker compose restart gateway
# aguarde ~30–60s
curl -vI https://www.engagesolar.com.br 2>&1 | head -30
```

Deve aparecer emissor **Let's Encrypt** (R3 / E7 etc.), não "self signed" genérico.
