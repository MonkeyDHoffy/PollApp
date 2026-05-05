# PollApp

PollApp ist eine Umfrage-Plattform zum Erstellen, Teilen und Auswerten von Surveys mit Live-Ergebnissen.

Live: https://pollapp.hoffja.de

## Was PollApp kann

- Magic-Link-Login per E-Mail (Supabase Auth)
- Gastmodus ohne Account (Name lokal gespeichert)
- Umfragen erstellen, bearbeiten, loeschen und duplizieren
- Private Umfragen mit Share-Link und optionalem Zugangscode
- Oeffentliche Umfragen fuer schnelle Teilnahme
- Live-Ergebnisse per Realtime-Updates
- CSV-Export der Ergebnisse (Creator-only)
- Sprachumschaltung Deutsch/Englisch (i18n)

## Tech Stack (Frontend und Backend)

### Frontend

- Angular 21 (Standalone Components)
- TypeScript + SCSS
- Angular Signals und OnPush Change Detection
- Reactive Forms
- Eigene UI-Komponenten (Modals, Dialoge, Inputs, Cards, Tabs, Toasts)

### Backend / Infrastruktur

- Supabase (Postgres, Auth, Realtime, Edge Functions: `survey-access`, `survey-submit`)
- Resend als SMTP-Provider fuer Auth-E-Mails
- DNS ueber INWX
- Hosting auf IONOS-Server mit Docker
- nginx im App-Container zum Ausliefern des Angular Builds
- Caddy als Reverse Proxy mit automatischen Let's Encrypt Zertifikaten

## Setup (lokal)

### Voraussetzungen

- Node.js 20+
- npm
- Zugriff auf das Supabase-Projekt (Auth + DB + Edge Functions)

### 1. Projekt starten

```bash
npm ci
npm start
```

App laeuft lokal unter `http://localhost:4200`.

### 2. Tests

```bash
npm test
```

### 3. Wichtige Auth-Konfiguration

- In Supabase muss `http://localhost:4200` als Redirect URL eingetragen sein.
- In Production muss die Site URL auf `https://pollapp.hoffja.de` zeigen.
- Der Frontend-Key in der Environment-Konfiguration ist der JWT Anon Key.

Detail-Doku siehe [POLLAPP_SETUP.md](POLLAPP_SETUP.md).

## Deployment

Produktivbetrieb erfolgt mit Docker Compose auf dem IONOS-Server.

### Architektur

1. Browser spricht HTTPS mit Caddy
2. Caddy terminiert TLS und leitet intern an den `pollapp`-Container weiter
3. nginx liefert das gebaute Angular-Frontend aus
4. Frontend spricht fuer Auth/DB mit Supabase

### Deploy-Ablauf

```bash
docker compose up -d --build pollapp
```

### Domain / Mail

- App-Domain: `pollapp.hoffja.de`
- Optional Redirect von `www.pollapp.hoffja.de` auf die Canonical Domain
- E-Mail-Domain fuer Versand: `resendmail.hoffja.de`

Alle DNS-, SMTP- und Caddy-Details stehen in [POLLAPP_SETUP.md](POLLAPP_SETUP.md).

## Funktionsuebersicht im Detail

### Authentifizierung

- Magic-Link-Login: User gibt E-Mail ein und erhaelt einen Login-Link.
- Gastmodus: Teilnahme ohne Account; Gastname wird lokal gespeichert.
- Eingeloggte User koennen eigene Umfragen verwalten.
- Gaeste koennen an freigegebenen Umfragen teilnehmen, aber keine Umfragen erstellen.

### Umfragen verwalten

- Erstellen mit Titel, Beschreibung, Kategorie, Enddatum, Sichtbarkeit
- Fragetypen: Single-Choice und Multiple-Choice
- Bearbeiten (inkl. Metadaten und Einstellungen)
- Duplizieren fuer schnelle Wiederverwendung
- Loeschen mit Sicherheitsabfrage

### Teilnahme und Zugriff

- Oeffentliche Umfragen ueber direkte Links
- Private Umfragen ueber Share-Link (`/join/:token`) plus optionalen Access Code
- Browser-basierter Schutz gegen Doppelabstimmung per `participant_token`

### Ergebnisse und Auswertung

- Live-Resultate via Supabase Realtime
- Prozentanzeige je Antwortoption
- CSV-Export fuer Umfrage-Ersteller

### Internationalisierung

- Deutsch und Englisch
- Umschaltbar in der UI
- Sprachwahl wird lokal persistiert

## Projektstruktur (kurz)

- App-Seiten: [src/app/app/shared/pages](src/app/app/shared/pages)
- UI-Komponenten: [src/app/app/shared/ui](src/app/app/shared/ui)
- Services und Modelle: [src/app/shared](src/app/shared)
- Supabase Edge Functions: [supabase/functions](supabase/functions)

## Weiterfuehrende Doku

- Vollstaendiges Setup, DNS, SMTP, Deployment und Troubleshooting: [POLLAPP_SETUP.md](POLLAPP_SETUP.md)
