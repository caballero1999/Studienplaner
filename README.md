# Studienplaner

Installierbare Web-App (PWA) für Module, Prüfungen, Stundenplan und Fristen im Bachelor Technische Informatik.

- Läuft offline, lässt sich auf den Homescreen legen und erinnert an Klausuren und Abgaben.
- Persönliche Startdaten liegen nur verschlüsselt in `seed.enc.json` (AES-GCM, Schlüssel per PBKDF2 aus einem Passwort). Nach dem ersten Entsperren speichert die App die Daten nur auf dem Gerät.
