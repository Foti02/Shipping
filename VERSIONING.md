# Versionamento

Numero di versione `MAJOR.MINOR.PATCH`, si parte da `0.0.0`. Ogni rilascio alza il numero **nella posizione giusta** e azzera quelli a destra.

| Posizione | Si alza quando | Esempio |
| --- | --- | --- |
| **MAJOR** (primo) | cambia qualcosa che rompe il passato: schema del database che richiede migrazione o azzeramento dati, flussi stravolti | `0.4.2` → `1.0.0` |
| **MINOR** (secondo) | nuove funzioni che non rompono nulla (nuova schermata, nuovo report, nuova stampa) | `0.4.2` → `0.5.0` |
| **PATCH** (terzo) | correzioni di errori e ritocchi piccoli | `0.4.2` → `0.4.3` |

Fino alla `1.0.0` l'app è in costruzione: la prima versione usabile in classe sarà la `0.1.0`.

## Come si rilascia

Un solo numero vale per tutto: sito, installer Windows e installer macOS. Vive in `main/package.json`.

```bash
cd main
npm run release -- minor "Aggiunta la stampa DDT"
git push --follow-tags
```

Il primo comando alza il numero, aggiorna `main/CHANGELOG.md`, fa il commit `release: vX.Y.Z` e mette il tag `vX.Y.Z`. Rifiuta di partire se ci sono modifiche non salvate o se manca la descrizione.
Il push del tag avvia GitHub Actions (`.github/workflows/release.yml`), che controlla che tag e `package.json` coincidano, esegue i test e pubblica su GitHub Releases:

- `Shipping-Setup-X.Y.Z.exe` (Windows)
- `Shipping-X.Y.Z-mac.dmg` (macOS)

Il sito mostra la versione in basso e i pulsanti "Installa per Windows / macOS" puntano all'ultima release. L'app desktop avvisa quando ne esiste una più nuova.

## Database

Le migrazioni Supabase hanno numerazione propria (`0001_...`, `0002_...`). Una migrazione che cambia dati esistenti conta come MAJOR.
