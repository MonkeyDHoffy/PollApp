# PollApp - Auth & Deployment Setup

Dokumentation der vollstaendigen Auth- und Hosting-Konfiguration fuer PollApp. Stand: 2026-05-05.

## Stack-Uebersicht

| Komponente | Wert |
|---|---|
| Frontend | Angular 21 (Reactive Forms, Signals) |
| Auth-Provider | Supabase (Magic-Link-Email-OTP) |
| SMTP-Provider | Resend (ueber Custom-SMTP in Supabase) |
| DNS-Registrar | INWX (Domain: hoffja.de) |
| Hosting | Eigener IONOS-Server, Docker-Container, Reverse-Proxy mit Let's Encrypt |
| Live-URL | https://pollapp.hoffja.de (Canonical, ohne www) |
| Supabase Projekt-ID | tjevdvwpybcojtyevekh (Region eu-west-1) |
| Server-IP | 85.214.181.154 |
| Resend-Domain | resendmail.hoffja.de (dedizierte Mail-Subdomain) |

## Architektur

```text
Browser
   |
   v  (HTTPS, Let's Encrypt Cert)
[Reverse Proxy auf IONOS-Server]
   |
   v  (HTTP intern)
[Docker-Container: nginx + Angular dist/]
   |
   v  (Auth Requests)
[Supabase Auth API]
   |
   v  (SMTP)
[Resend smtp.resend.com:465]
   |
   v  (Verifizierte Sender-Domain)
   resendmail.hoffja.de
```

## DNS bei INWX

Alle DNS-Eintraege liegen auf hoffja.de bei INWX. INWX haengt die Domain automatisch an den Hostnamen an, daher nur den Subdomain-Teil eintragen.

### App-Domain

| Typ | Hostname | Wert | TTL | Prioritaet |
|---|---|---|---|---|
| A | pollapp | 85.214.181.154 | 3600 | - |
| CNAME | www.pollapp | pollapp.hoffja.de. | 3600 | - |

### Resend-Domain (resendmail.hoffja.de)

| Typ | Hostname | Wert | Prioritaet |
|---|---|---|---|
| TXT | resend._domainkey.resendmail | p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ... | - |
| MX | send.resendmail | feedback-smtp.eu-west-1.amazonses.com | 10 |
| TXT | send.resendmail | v=spf1 include:amazonses.com ~all | - |
| TXT (optional) | _dmarc.resendmail | v=DMARC1; p=none; | - |

## Resend Setup

- Account-Mail: jonekstoff@googlemail.com
- Region: Ireland (eu-west-1), passend zu Supabase
- Verifizierte Domain: resendmail.hoffja.de
- API-Key: mit Sending access (nur in Supabase-SMTP-Settings, nie im Repo)
- Sender-Adresse: noreply@resendmail.hoffja.de

## Supabase Konfiguration

Dashboard:
https://supabase.com/dashboard/project/tjevdvwpybcojtyevekh

### Authentication -> URL Configuration

- Site URL: https://pollapp.hoffja.de
- Redirect URLs:
  - http://localhost:4200
  - https://pollapp.hoffja.de
  - https://www.pollapp.hoffja.de
  - https://pollapp.hoffja.de/**
  - https://www.pollapp.hoffja.de/**

### Authentication -> Emails -> SMTP Settings

| Feld | Wert |
|---|---|
| Enable custom SMTP | ON |
| Sender email address | noreply@resendmail.hoffja.de |
| Sender name | PollApp |
| Host | smtp.resend.com |
| Port | 465 |
| Minimum interval per user | 10 Sekunden |
| Username | resend |
| Password | re_... (Resend API-Key, einmalig eintragen) |

## Frontend-Code: Wichtige Stellen

### src/environments/environment.ts (Production)

```typescript
export const environment = {
  production: true,
  supabaseUrl: 'https://tjevdvwpybcojtyevekh.supabase.co',
  supabasePublishableKey: 'eyJ...', // JWT Anon-Key
};
```

Hinweis: Fuer einige Auth-Flows den JWT Anon-Key verwenden statt sb_publishable_*.

### src/app/shared/services/supabase-client.ts

```typescript
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export const supabaseClient = createClient(
  environment.supabaseUrl,
  environment.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'pollapp-auth',
      lock: <T,>(_name: string, _acquireTimeout: number, fn: () => Promise<T>) => fn(),
    },
  }
);
```

### Angular Form Setup im Login-Component

FormGroup ist notwendig, damit (ngSubmit) ausgeloest wird.

```typescript
authForm = this.fb.group({
  email: this.authEmailControl,
});
```

```html
<form [formGroup]="authForm" (ngSubmit)="sendMagicLink()" novalidate>
  <input type="email" [formControl]="authEmailControl" />
  <button type="submit">Magic Link senden</button>
</form>
```

### CSS Stolperfalle: Backdrop Z-Index

```scss
.home__auth-panel-backdrop { z-index: 140; }
.home__auth-panel { z-index: 200; }
```

## Server Deployment (Docker auf IONOS)

### Dockerfile (Multi-Stage)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration=production

FROM nginx:alpine
COPY --from=builder /app/dist/pollapp/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### nginx.conf

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
}
```

### Reverse Proxy mit Caddy

```caddy
pollapp.hoffja.de {
  reverse_proxy pollapp:80
}

www.pollapp.hoffja.de {
  redir https://pollapp.hoffja.de{uri} permanent
}
```

### docker-compose.yml

```yaml
services:
  pollapp:
    build: .
    container_name: pollapp
    restart: unless-stopped
    networks:
      - web

  caddy:
    image: caddy:alpine
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - web

volumes:
  caddy_data:
  caddy_config:

networks:
  web:
    driver: bridge
```

Deployment-Workflow:
1. Code-Update auf den Server (git pull oder SCP)
2. docker compose up -d --build pollapp
3. Caddy bleibt laufen

## Bekannte, bereits behobene Bugs

1. Default SMTP Rate Limit in Supabase (2 Mails/h ohne Custom SMTP)
2. Backdrop Z-Index blockiert Submit
3. (ngSubmit) ohne [formGroup]
4. BroadcastChannel Lock in Supabase Auth JS
5. Falscher Key Typ (sb_publishable_*)
6. Resend Sandbox Beschraenkung ohne verifizierte Domain

## Troubleshooting

### Magic Link Mail kommt nicht an

- Supabase Auth Logs pruefen (mail.send, error)
- Resend Activity Logs pruefen
- Spam Ordner pruefen
- DKIM/SPF Records validieren

### /otp POST kommt nicht beim Auth Server an

Moegliche Ursachen:
- [formGroup] fehlt
- JS Error vor Auth Call
- Email Validator blockt
- Click wird vom Backdrop abgefangen

### /otp schickt OPTIONS aber kein POST

- Supabase Auth JS Lock Problem, Custom lock setzen

### No API key found (500)

- JWT Anon Key statt sb_publishable_* nutzen

## Sicherheit

- Resend API Key nie ins Repo
- Supabase Anon Key im Frontend ist erwartbar/public
- HTTPS ueberall erzwingen
- Accounts (INWX, Resend, Supabase) mit 2FA absichern

## Referenzen

- Supabase Dashboard: https://supabase.com/dashboard/project/tjevdvwpybcojtyevekh
- Resend Domains: https://resend.com/domains
- INWX DNS: https://account.inwx.de/de/nameserver2
- Resend SMTP Doku: https://resend.com/docs/send-with-smtp
- Supabase Auth Doku: https://supabase.com/docs/guides/auth
