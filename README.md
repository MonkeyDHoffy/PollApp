# PollApp

Web-App zum Erstellen und Verwalten von Umfragen.

## Tech Stack

- Frontend: Angular 21 (Reactive Forms, Signals)
- Auth: Supabase (Magic-Link per Email OTP)
- SMTP: Resend (Custom SMTP in Supabase)
- Hosting: IONOS Server mit Docker (nginx + Angular dist) hinter Reverse Proxy (Caddy + Let's Encrypt)
- Live URL: https://pollapp.hoffja.de

## Projekt Setup (Kurzfassung)

1. Abhaengigkeiten installieren:

```bash
npm ci
```

2. Lokal starten:

```bash
npm start
```

3. Tests ausfuehren:

```bash
npm test
```

## Auth Setup (Supabase)

- Supabase Projekt-ID: `tjevdvwpybcojtyevekh` (eu-west-1)
- Site URL: `https://pollapp.hoffja.de`
- Redirect URLs enthalten lokal und live:
	- `http://localhost:4200`
	- `https://pollapp.hoffja.de`
	- `https://www.pollapp.hoffja.de`
	- plus `/**` Wildcards fuer beide Domains

Wichtige technische Punkte im Frontend:

- In `src/environments/environment.ts` den JWT Anon Key verwenden (nicht `sb_publishable_*`), um Auth-500 (`No API key found`) zu vermeiden.
- In `src/app/shared/services/supabase-client.ts` ist ein Custom `lock` gesetzt, damit `getSession()` und `signInWithOtp` sich nicht blockieren.
- Login Form braucht `[formGroup]` zusammen mit `(ngSubmit)`, damit Submit korrekt feuert.
- Auth Panel muss ueber dem Backdrop liegen (`z-index`), damit Klicks nicht abgefangen werden.

## Deployment Setup

Deployment erfolgt auf dem IONOS Server per Docker Compose:

- `pollapp` Service: baut Angular App und liefert statische Dateien via nginx aus
- `caddy` Service: Reverse Proxy + TLS Zertifikate (Let's Encrypt)

Typischer Deploy-Ablauf:

1. Code aktualisieren (`git pull` oder Upload)
2. Build + Update:

```bash
docker compose up -d --build pollapp
```

3. Caddy laeuft weiter und terminiert HTTPS

## DNS / Mail

- App Domain: `pollapp.hoffja.de` zeigt per A-Record auf den Server
- Optional `www.pollapp.hoffja.de` als CNAME auf die Canonical Domain
- Mail Domain fuer Resend: `resendmail.hoffja.de` mit DKIM, SPF, MX

## Vollstaendige Dokumentation

Die komplette Einrichtungsdoku (Auth, DNS, SMTP, Deployment, Troubleshooting) ist in:

- `POLLAPP_SETUP.md`
