# PollApp Rollout Plan (Supabase-first)

## Zielbild
- Ausgeloggt: keine normalen Umfragen sichtbar.
- Gastmodus: Demo-Umfragen sichtbar und beantwortbar.
- Eingeloggt: "My surveys" + "Public surveys" getrennt.
- Teilnahme: per Share-Link/Code ohne Login moeglich.
- Teilnahme-Regel: pro Teilnehmer nur 1 Antwort je Umfrage.
- Private Surveys: nur per Link/Code oder Owner sichtbar.
- Enddatum: konfigurierbar und Teilnahme nach Ablauf blockiert.
- Ergebnisse: live fuer alle Teilnehmer sichtbar.

## Meilensteine

### 1) Zugriff und Flows stabilisieren
- Home-Access-Gating: ausgeloggt ohne Gastmodus sieht keine Survey-Listen.
- Gastmodus als Toggle (ein/aus) ueber denselben Button.
- Auth- und Survey-State synchron halten (keine stale User-Listen nach Logout).
- Commit: `step-1-access-and-session-flow`

### 2) Datenmodell erweitern (Supabase Schema + App Models)
- Surveys um Sichtbarkeit erweitern: `public` | `private`.
- Share-Link/Code Felder: `share_token`, optional `access_code`.
- Teilnehmeridentitaet ohne Login: `participant_token` (anonymes, lokales Token).
- DB-Constraints fuer "eine Antwort pro Teilnehmer pro Survey".
- Commit: `step-2-schema-and-models`

### 3) RLS Policies auf Zielbild ausrichten
- Owner sieht eigene Surveys immer.
- Public Surveys sichtbar fuer alle (auch anonym, falls explizit erlaubt).
- Private Surveys nur Owner oder gueltiger Link/Code-Teilnehmer.
- Antworten nur wenn Survey offen und nicht abgelaufen.
- Commit: `step-3-rls-policies`

### 4) UI/UX: My vs Public klar trennen
- Home fuer Login: getrennte Bereiche "My surveys" und "Public surveys".
- Home fuer Logout: Login-CTA + Gastmodus-CTA, keine normalen Listen.
- Survey-Detail: Teilnahme-Status, Ablauf-Hinweis, Fehlerstates.
- Commit: `step-4-home-and-detail-ux`

### 5) Teilnahme via Share-Link/Code
- Neue Route fuer Teilnahme (z. B. `/join/:token`).
- Optionaler Access-Code-Dialog fuer private Surveys.
- Persistenter `participant_token` im Browser.
- Commit: `step-5-share-flow`

### 6) Ergebnislogik und Live-Ansicht
- Aggregation fuer Antworten robust machen.
- Live-Update via Supabase Realtime (optional) oder Polling.
- Einheitliche Result-Darstellung fuer Demo und echte Surveys.
- Commit: `step-6-live-results`

### 7) Stabilisierung und E2E
- End-to-End Flows: Login, Create, Share, Participate, Logout, Gastmodus.
- Edge Cases: Ablaufdatum, doppelte Teilnahme, private Link-Fehler.
- Portfolio-Readme + klare Produktbeschreibung.
- Commit: `step-7-hardening-and-e2e`