# NBS Toolkit - Administrator Guide

[🇮🇹 Versione in italiano qui](#nbs-toolkit---guida-per-lamministratore-versione-italiana)

This guide walks you through settings up and managing the TALEA NBS Toolkit web application.\
The app runs on **GitHub Pages**, uses **Google Sheets** as a lightweight backend for managing case study submissions, and a **Cloudflare Worker** as an Ai proxy for the AI Assistant feature.

## Table of Contents

## 1. How the system works

```text
 USER                        GOOGLE SHEET                    GITHUB / WEBSITE
  |                              |                                |
  |  Fills out the form          |                                |
  |  on the website              |                                |
  |----------------------------->|                                |
  |  Image uploaded to imgbb     |                                |
  |  Form data sent via          |                                |
  |  Apps Script --------------->|  New row added                 |
  |                              |  status = "pending"            |
  |                              |                                |
  |                              |  Email sent to supervisor      |
  |                              |                                |
  |                         SUPERVISOR                            |
  |                              |                                |
  |                   Reviews the row                             |
  |                   Changes status to                           |
  |                   "approved" or "denied"                      |
  |                              |                                |
  |                              |     Every night at 2 AM UTC    |
  |                              |     (or manually triggered)    |
  |                              |                                |
  |                              |------------------------------->|
  |                              |  Sync script reads the sheet   |
  |                              |  Rebuilds caseStudies.json     |
  |                              |  from ALL approved rows        |
  |                              |                                |
  |                              |         Website auto-deploys   |
  |                              |         with updated data      |
  |<-----------------------------|------------------------------->|
  |  User sees updated studies                                    |
```

**AI Assistant flow (separate):**

```text
 USER                     CLOUDFLARE WORKER              GOOGLE GEMINI API
  |                              |                              |
  |  Types a query in the        |                              |
  |  AI Assistant panel          |                              |
  |----------------------------->|                              |
  |                              |  Forwards request to ------->|
  |                              |  Gemini with structured      |
  |                              |  schema + system prompt      |
  |                              |                              |
  |                              |<--- JSON response -----------|
  |<--- Filters + results -------|                              |
  |                              |                              |
  |  Frontend applies filters    |                              |
  |  locally on caseStudies.json |                              |
```

**Key points:**

- The **Google Sheet** is the single source of truth. The website's data file (`caseStudies.json`) is rebuilt entirely from approved rows every sync.
- Submissions are **never stored locally** in user browser. They go straight to the sheet.
- The AI Assistant **does not access the sheet directly**. It generates filters that are applied cliet-side to the local JSON data.
- To **remove** a study: change its status to "denied". It will disappear from the website on the next sync.
- To **edit** a study: edit the row directly in the sheet. Changes appear on the next sync.

## 2. Initial setup (one-time)

### 2.1 Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet.
2. Rename the first sheet tab to **Submissions** (right-click the tab at the bottom).
3. Leave it empty for now - headers will be auto-created.

### 2.2 Set up Google Apps Script

The Apps Script receives form submissions from the website and writes them to the sheet.

1. In your Google Sheet, go  to **Extensions > Apps Scripts**
2. Delete all the default code in the editor
3. Open the file `google-apps-script.js` from this repository and copy its entire contents
4. Paste it into the Apps Script editor
5. **Edit line 23** - change `"supervisor@example.com"` to the real supervisor email address:

    ```javascript
   var SUPERVISOR_EMAIL = "your.email@example.com";
   ```

6. Click **Save**
7. Go to **Deploy > New deployment**
8. Click the gear icon next to "Select type" and choose **Web app**
9. Set:

    - **Description**: "TALEA form receiver" (optional)
    - **Execute as**: **Me** (your Google account)
    - **Who has access**: **Anyone

10. Click **Deploy**
11. If prompted, click **Authorize access** and go through the Google permission flow
12. **Copy the Web app URL** - it looks like:

    ```text
    https://script.google.com/macros/s/AKfycbx.../exec
    ```

    **Save this URL, you'll need it for Step 2.6.**

> **Important:** If you later edit the Apps Script code, you must go to **Deploy > New deployment** again (not "Manage deployments") to publish the updated version.

### 2.3 Publish the Sheet as CSV

The nightly sync resds the sheet data through a puvblic CSV URL. This is separate from the Apps Script.

1. In your Google Sheet, go to **File > Share > Publish to web**
2. In the first dropdown, select **Submissions** (not "Entire document")
3. In the second dropdown, select **Comma-separated values (.csv)**
4. Click **Publish** and confirm
5. **Copy the URL** - it looks like:

    ```text
    https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv
    ```

   **Save this URL for Step 2.6.**

> This URL is read-only. Anyone with the link can view the sheet data but not edit it.

### 2.4 Set up imgbb image hosting (optional but recommended)

When users submit a case study with an image, the image is uploaded to imgbb (a free image hosting service) and stored as a URL. Without this, images included in form submission cannot be saved.

1. Go to [imgbb.com](https://imgbb.com) and create a free account
2. Go to [api.imgbb.com](https://api.imgbb.com/)
3. Copy your **API key**
4. **Save ti for Step 2.6**

> Free tier: unlimited uploads, images hosted indefinetly.

### 2.5 Set up the Cloudflare Worker (AI Assistant)

The Ai Assistant feature requires a Cloudflare Worker that proxies requests to the Google Gemini API. This handles rate limiting and keeps the API key secure.

**2.5.1 Prerequisites**

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) installed
- A free Google AI API key from [Google AI Studio](https://aistudio.google.com) (click "Get API key" > "Create API Key" - no credit card required)

---

**2.5.2 Install Wrangler (Cloudlare CLI)**

```bash
npm install -g wrangler
wrangler login
```

---

**2.5.3 Create the KV namespace (rate limiting storage)**

```bash
cd cloudflare-worker
wrangler kv namespace create RATE_LIMIT
```

Copy the `id` value from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "your-id-here"
```

---

**2.5.4 Configure wrangler.toml**

Edit `cloudflare-worker/wrangler.toml`:

```toml
name = "talea-abacus-api"
main = "worker-gemini.js"          # Use Gemini version
compatibility_date = "2025-01-01"

[vars]
ALLOWED_ORIGIN = "https://your-domain.com"   # Your GitHub Pages URL

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "y
```

Set `ALLOWED_ORIGIN` to your actual website URL (e.g `https://talea.comune.bologna.it`). For multiple origins, use comma-separated values: `"https://domain1.com,https://domain2.com"`.

---

**2.5.5 Add the API key secret**

```bash
wrangler secret put GEMINI_API_KEY
# Paste your Google AI Studio API key when prompted
```

---

**2.5.6 Deploy**

```bash
wrangler deploy
```

**Note the deployed URL** (e.g `https://talea-abacus-api.your-account.workers.dev`). You'll need it for the GitHub Secret `REACT_APP_WORKER_URL`.

---

**2.5.7 Rate limits**

The worker enforces per-user daily limits via Cloudflare KV:

| Bucket                 | Default limit    | Used by                                   |
|------------------------|------------------|-------------------------------------------|
| Regular (quick search) | 150/day per user | `/api/chat` and `/api/analyze`            |
| Thinking (deep search) | 75/day per user  | `/api/think-pass1` and `/api/think-pass2` |

The Google Gemini free tier has its own global limit (varies by model - e.g 500 for the model we use right now). All users share this global quota. Adjust per-user limits in the worker if needed.

### 2.6 Add GitHub Secrets

GitHub Secrets are how the website and aumation access the services you set up above, without exposing credentials in the code.

1. Go to the GitHub repository
2. Click **Settings** (top menu bar)
3. In the left sidebar, click **Secrects and variables > Actions**
4. Click **New repository secret** for each of the following:

    | Secret name                  | Value                                     | What it does                                     |
    |------------------------------|-------------------------------------------|--------------------------------------------------|
    | `REACT_APP_GOOGLE_SHEET_URL` | The Apps Script URL from Step 2.2         | Tells the website where to send form submissions |
    | `REACT_APP_IMGBB_API_KEY`    | The imgbb API key from Step 2.4           | Allows the website to upload user images         |
    | `REACT_APP_WORKER_URL`       | The Cloudflare Worker URL from Step 2.5.6 | Tells the AI Assistant where to send queries     |
    | `GOOGLE_SHEET_CSV_URL`       | The CSV publish URL from Step 2.3         | Allows the nightly sync to read the sheet        |

> **How they work**: Secrets starting with `REACT_APP_` are embedded into the website's code when it builds.\
> `GOOGLE_SHEET_CSV_URL` is the only used by the sync script running in GitHub Actions - it never appers in the website code.

### 2.7 Initialize the Sheet with existing data

The app comes with 50 built-in case studies. To make the sheet the source of truth, you need to import them into the sheet once. Thsi also optionally uploads all local images to imgbb.

**On your computer** (Requires Node.js installed):

```bash
# Navigate to the project folder
cd nbstoolkit

# Option A: Generate CSV only (no image upload)
node scripts/init-sheet.js

# Option B: Generate CSV + upload all images to imgbb
IMGBB_API_KEY=your_key_here node scripts/init-sheet.js
```

**On Windows** (PowerShell), set the env var like this:

> ```powershell
> $env:IMGBB_API_KEY="your_key_here"; node scripts/init-sheet.js
> ```

This create a file called `scripts/init-data.csv`.

**Then import it into Google Sheets:**

1. Open you Google Sheet
2. Go to **File > Import > Upload**
3. Select the `scripts/init-data.csv` file
4. Choose **Replace current sheet** and select the "Submissions sheet
5. Click **Import data**
6. Verify:

    - Row 1 should contain headers (`id`, `status`, `submitted_at`, `title`, ...)
    - All 50 rows should show `status = approved`
    - Each row should have an `id` from 1 to 50
    - If you used Imgbb option, the `image_url` column should contain imgbb URLs
  
7. You can now delete `scripts/init-data.csv` from youe computer - it's not needed anymore

**After importing**, [trigger a manual sync](#34-trigger-a-manual-sync) on GitHub to verify everything works

## 3. Day-to-day management

### 3.1 Reviewing new submissions

When someone submits a new case study through the website:

1. You receive an **email notification** with the study details and a link to sheet
2. Open the Google Sheet - the new row appears at the bottom with `status = pending`
3. Review the data in the row
4. Change the `status` cell to:

    - **`approved`** - the study will appear on the website after the next sync
    - **`denied`** - the study stays in the sheet for records but will not appear on the website
  
5. The next nightly sync (2 AM UTC) will pick up the change, or you can [trigger a manual sync](#34-triggering-a-manual-sync)

> New submissions don't have an `id`. The sync script automatically assign the next available ID.

### 3.2 Editing existing studies

To change any information about a case study:

1. Open the Google Sheet
2. Find the row
3. Edit the cell directly - title, description, coordinates, NBS categories, etc.
4. The changes will appear on the website after the next sync

### 3.3 Removing a study

**Option A - Soft delete (recommended):** Change the `status` column to `denied`. The study disappers from the website but stays in the sheet as a record.

**Option B - Hard delete:** Delete the entire row from the sheet. The study will be removed from the website on the next sync. This cannot be undone.

> Is recommended to use Option A. Option B can cause problems with ID values.

### 3.4 Trigger a manual sync

Instead of waiting for the nightly sync (2 AM UTC), you can trigger it immediately:

1. Go to your GitHub repository > **Actions** tab
2. Click **Nightly Sync Approved Studies** in the left sidebar
3. Click **Run workflow > Run workflow**
4. Wait for it to complete (green checkmark)
5. The website shuold now display data synced from the sheet

You can also trigger a sync after pushing code changes:

- The **Deploy to GitHub Pages** workflow runs automatically on every push to `main`

---

## 4. How the Google Sheet works (external Excel)

The Google Sheet acts as an **external database** that the administrator can manage like a normal spreadsheet. Here's how it fits together:

### Sheet structure

The sheet has one tab called **"Submissions"** with one row per case study. Key columns:

| Column                                                           | Purpose                                                                      |
|------------------------------------------------------------------|------------------------------------------------------------------------------|
| `id`                                                             | Unique numeric ID (auto-assigned by sync script for new submissions)         |
| `status`                                                         | Controls visibility: `approved` = on website, `denied` or `pending` = hidden |
| `submitted_at`                                                   | Timestamp of when the study was submitted                                    |
| `title`, `city`, `country`, `year`                               | Basic info                                                                   |
| `description`                                                    | Project description (free text)                                              |
| `latitude`, `longitude`                                          | Map coordinates                                                              |
| `image_url`                                                      | URL to the project image (hosted on imgbb)                                   |
| `physical_innovation`, `social_innovation`, `digital_innovation` | Innovation text fields                                                       |
| `talea_application`, `size`, `climate_zone`                      | Core classification                                                          |
| `a1_*` through `a7_*`                                            | Physical context categories (comma-separated values)                         |
| `b1_*` through `b6_*`                                            | Constraints and opportunities                                                |
| `c1_*` through `c4_*`                                            | Design process, funding, actors, goals, services                             |
| `d1_*` through `d6_*`                                            | NBS elements (plants, paving, water, roofs, furnishings, spaces)             |

### What the supervisor can do directly in the sheet

- **Approve/deny** submissions by changing the `status` cell
- **Edit any field** — changes are picked up on the next sync
- **Add a study manually** — add a new row with `status = approved` (the sync will assign an ID)
- **Remove a study** — set `status = denied` or delete the row
- **Bulk edit** — use normal spreadsheet features (find/replace, sorting, filtering)
- **Export** — download as Excel/CSV from Google Sheets at any time

### Important notes

- **Never rename or reorder the header row** — the sync script depends on exact column names
- **Category values must match exactly** — use the same values as defined in `src/data/filterConfig.js` (comma-separated if multiple)
- **Don't edit the ID**

---

# NBS Toolkit - Guida per l'Amministratore (Versione Italiana)

[🇬🇧 English version here](#nbs-toolkit---administrator-guide)

Questa guida ti accompagna nella configurazione e nella gestione dell'applicazione web TALEA NBS Toolkit.
L'app gira sulle **GitHub Pages**, utilizza **Google Sheets** come database "leggero" per gestire l'invio dei casi studio e un **Cloudflare Worker** come proxy per la funzionalità dell'Assistente AI.

## Sommario

## 1. Come funziona il sistema

```text
 UTENTE                     FOGLIO GOOGLE                    GITHUB / SITO WEB
  |                              |                                |
  | Compila il modulo sul        |                                |
  | sito web                     |                                |
  |----------------------------->|                                |
  | Immagine caricata su imgbb   |                                |
  | Dati inviati tramite         |                                |
  | Apps Script ---------------->| Nuova riga aggiunta            |
  |                              | status = "pending"             |
  |                              |                                |
  |                              | Email inviata al supervisore   |
  |                              |                                |
  |                         SUPERVISORE                           |
  |                              |                                |
  |                  Esamina la riga                              |
  |                  Cambia lo stato in                           |
  |                  "approved" o "denied"                        |
  |                              |                                |
  |                              | Ogni notte alle 2:00 UTC       |
  |                              | (o attivato manualmente)       |
  |                              |                                |
  |                              |------------------------------->|
  |                              | Lo script di sync legge i dati |
  |                              | Ricostruisce caseStudies.json  |
  |                              | da TUTTE le righe approvate    |
  |                              |                                |
  |                              |        Il sito si aggiorna     |
  |                              |        con i nuovi dati        |
  |<-----------------------------|------------------------------->|
  | L'utente vede gli studi aggiornati                            |
```

**Flusso dell'Assistente AI (separato):**

```text
 UTENTE                   CLOUDFLARE WORKER                  API GOOGLE GEMINI
  |                              |                                |
  | Digita una query nel         |                                |
  | pannello Assistente AI       |                                |
  |----------------------------->|                                |
  |                              | Inoltra la richiesta a ------->|
  |                              | Gemini con schema strutturato  |
  |                              | e system prompt                |
  |                              |                                |
  |                              |<--- Risposta JSON -------------|
  |<--- Filtri + risultati ------|                                |
  |                              |                                |
  | Il frontend applica i filtri |                                |
  | localmente su caseStudies.json                                |
```

**Punti chiave:**

- **Google Sheets** è l'unica vera fonte dei dati. Il file `caseStudies.json` viene ricostruito interamente dalle righe approvate a ogni sincronizzazione.
- Gli invii **non vengono mai salvati localmente** nel browser dell'utente, ma finiscono direttamente nel foglio di calcolo.
- L'Assistente AI **non accede direttamente al foglio**. Genera invece dei filtri che vengono applicati lato client sui dati JSON locali.
- Per **rimuovere** uno studio: cambia il suo stato in "denied". Scomparirà dal sito web alla successiva sincronizzazione.
- Per **modificare** uno studio: modifica direttamente la riga nel foglio. Le modifiche appariranno alla successiva sincronizzazione.

---

## 2. Configurazione iniziale

### 2.1 Creare un Foglio Google

1. Vai su [Google Sheets](https://sheets.google.com) e crea un nuovo foglio di calcolo.
2. Rinomina la prima scheda in basso in **Submissions** (facendo clic destro sulla linguetta).
3. Per ora lascialo vuoto: le intestazioni verranno create automaticamente.

### 2.2 Configurare Google Apps Script

L'Apps Script riceve i dati dal modulo del sito web e li scrive nel foglio di calcolo.

1. Nel tuo Foglio Google, vai su **Estensioni \> Apps Script**
2. Cancella tutto il codice predefinito presente nell'editor
3. Apri il file `google-apps-script.js` da questa repository e copia l'intero contenuto
4. Incollalo nell'editor di Apps Script
5. **Modifica la riga 23**: cambia `"supervisor@example.com"` con il vero indirizzo email del supervisore:

    ```javascript
    var SUPERVISOR_EMAIL = "la.tua.email@example.com";
    ```

6. Clicca su **Salva**
7. Vai su **Esegui il deployment \> Nuovo deployment**
8. Clicca sull'icona a forma di ingranaggio accanto a "Seleziona tipo" e scegli **Applicazione web**
9. Imposta:

      - **Descrizione**: "Ricevitore modulo TALEA" (opzionale)
      - **Esegui come**: **Me** (il tuo account Google)
      - **Chi ha accesso**: **Chiunque**

10. Clicca su **Esegui il deployment**
11. Se richiesto, clicca su **Autorizza accesso** e segui la procedura di autorizzazione di Google
12. **Copia l'URL dell'Applicazione web** - avrà un formato simile a:

    ```text
    https://script.google.com/macros/s/AKfycbx.../exec
    ```

    **Salva questo URL, ti servirà per il Passaggio 2.6.**

> **Importante:** Se in futuro modificherai il codice di Apps Script, dovrai andare di nuovo su **Esegui il deployment \> Nuovo deployment** (e non "Gestisci deployment") per pubblicare la versione aggiornata.

### 2.3 Pubblicare il Foglio come CSV

La sincronizzazione notturna legge i dati del foglio tramite un URL CSV pubblico. Questo è un processo separato da Apps Script.

1. Nel tuo Foglio Google, vai su **File \> Condividi \> Pubblica sul Web**
2. Nel primo menu a tendina, seleziona **Submissions** (non "Intero documento")
3. Nel secondo menu a tendina, seleziona **Valori separati da virgola (.csv)**
4. Clicca su **Pubblica** e conferma
5. **Copia l'URL** - sarà simile a questo:

    ```text
    https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=0&single=true&output=csv
    ```

    **Salva questo URL per il Passaggio 2.6.**

> Questo URL è in sola lettura. Chiunque abbia il link può visualizzare i dati del foglio ma non può modificarli.

### 2.4 Configurare l'hosting immagini su imgbb (opzionale ma consigliato)

Quando gli utenti inviano un caso studio con un'immagine, questa viene caricata su imgbb (un servizio gratuito di hosting di immagini) e salvata come URL. Senza questo passaggio, le immagini incluse nell'invio del modulo non possono essere salvate.

1. Vai su [imgbb.com](https://imgbb.com) e crea un account gratuito
2. Vai su [api.imgbb.com](https://api.imgbb.com/)
3. Copia la tua **chiave API**
4. **Salvala per il Passaggio 2.6**

> Piano gratuito: caricamenti illimitati, immagini ospitate a tempo indeterminato.

### 2.5 Configurare il Cloudflare Worker (Assistente AI)

La funzionalità dell'Assistente AI richiede un Cloudflare Worker che faccia da proxy per le richieste verso l'API di Google Gemini. Questo serve a gestire i limiti di traffico (rate limiting) e a mantenere sicura la chiave API.

**2.5.1 Prerequisiti**

- Un account gratuito su [Cloudflare](https://dash.cloudflare.com/sign-up)
- [Node.js](https://nodejs.org/) installato
- Una chiave API gratuita di Google AI da [Google AI Studio](https://aistudio.google.com) (clicca su "Get API key" \> "Create API Key" - nessuna carta di credito richiesta)

---

**2.5.2 Installare Wrangler (Cloudflare CLI)**

```bash
npm install -g wrangler
wrangler login
```

---

**2.5.3 Creare il namespace KV (archiviazione per il rate limiting)**

```bash
cd cloudflare-worker
wrangler kv namespace create RATE_LIMIT
```

Copia il valore `id` restituito in output e aggiorna `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "il-tuo-id-qui"
```

---

**2.5.4 Configurare wrangler.toml**

Modifica `cloudflare-worker/wrangler.toml`:

```toml
name = "talea-abacus-api"
main = "worker-gemini.js"          # Usa la versione Gemini
compatibility_date = "2025-01-01"

[vars]
ALLOWED_ORIGIN = "https://tuo-dominio.com"   # L'URL del tuo sito su GitHub Pages

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "y
```

Imposta `ALLOWED_ORIGIN` con l'URL effettivo del tuo sito web (es. `https://talea.comune.bologna.it`). Per domini multipli, usa valori separati da virgola: `"https://dominio1.com,https://dominio2.com"`.

---

**2.5.5 Aggiungere il secret per la chiave API**

```bash
wrangler secret put GEMINI_API_KEY
# Incolla la tua chiave API di Google AI Studio quando richiesto
```

---

**2.5.6 Deployment**

```bash
wrangler deploy
```

**Prendi nota dell'URL generato** (es. `https://talea-abacus-api.tuo-account.workers.dev`). Ti servirà per il Secret di GitHub `REACT_APP_WORKER_URL`.

---

**2.5.7 Limiti di utilizzo (Rate limits)**

Il worker applica dei limiti giornalieri per utente tramite Cloudflare KV:

| Categoria                    | Limite predefinito          | Utilizzato da                           |
|------------------------------|-----------------------------|-----------------------------------------|
| Regolare (ricerca rapida)    | 150/giorno per utente       | `/api/chat` e `/api/analyze`            |
| Ragionato (ricerca profonda) | 75/giorno per utente        | `/api/think-pass1` e `/api/think-pass2` |

Il piano gratuito di Google Gemini ha un proprio limite globale (varia in base al modello - es. 500 richieste per il modello che usiamo attualmente). Tutti gli utenti condividono questa quota globale. Regola i limiti per utente all'interno del worker se necessario.

### 2.6 Aggiungere i Secret su GitHub

I "Secret" di GitHub sono il modo in cui il sito web e le automazioni accedono ai servizi appena configurati, senza esporre le credenziali nel codice.

1. Vai alla tua repository su GitHub

2. Clicca su **Settings** (nella barra dei menu in alto)

3. Nella barra laterale sinistra, clicca su **Secrets and variables \> Actions**

4. Clicca su **New repository secret** per ciascuna delle seguenti voci:

    | Nome del Secret              | Valore                                          | Cosa fa                                                      |
    |------------------------------|-------------------------------------------------|--------------------------------------------------------------|
    | `REACT_APP_GOOGLE_SHEET_URL` | L'URL di Apps Script dal Passaggio 2.2          | Indica al sito web dove inviare i dati del modulo            |
    | `REACT_APP_IMGBB_API_KEY`    | La chiave API di imgbb dal Passaggio 2.4        | Permette al sito web di caricare le immagini degli utenti    |
    | `REACT_APP_WORKER_URL`       | L'URL del Cloudflare Worker dal Passaggio 2.5.6 | Indica all'Assistente AI dove inviare le query               |
    | `GOOGLE_SHEET_CSV_URL`       | L'URL di pubblicazione CSV dal Passaggio 2.3    | Permette alla sincronizzazione notturna di leggere il foglio |

> **Come funzionano**: I secret che iniziano per `REACT_APP_` vengono incorporati nel codice del sito web durante la compilazione.
> `GOOGLE_SHEET_CSV_URL` è utilizzato esclusivamente dallo script di sincronizzazione che gira su GitHub Actions - non appare mai nel codice del sito.

### 2.7 Inizializzare il Foglio con i dati esistenti

L'app include 50 casi studio predefiniti. Per rendere il foglio di calcolo la vera fonte dei dati, devi importarli nel foglio una prima volta. Questo processo può caricare automaticamente anche tutte le immagini locali su imgbb (opzionale).

**Sul tuo computer** (Richiede Node.js installato):

```bash
# Entra nella cartella del progetto
cd nbstoolkit

# Opzione A: Genera solo il file CSV (nessun caricamento di immagini)
node scripts/init-sheet.js

# Opzione B: Genera il CSV + carica tutte le immagini su imgbb
IMGBB_API_KEY=la_tua_chiave_qui node scripts/init-sheet.js
```

**Su Windows** (PowerShell), imposta la variabile d'ambiente in questo modo:

> ```powershell
> $env:IMGBB_API_KEY="la_tua_chiave_qui"; node scripts/init-sheet.js
> ```

Questo creerà un file chiamato `scripts/init-data.csv`.

**Successivamente, importalo in Google Sheets:**

1. Apri il tuo Foglio Google

2. Vai su **File \> Importa \> Carica**

3. Seleziona il file `scripts/init-data.csv`

4. Scegli **Sostituisci foglio corrente** e seleziona la scheda "Submissions"

5. Clicca su **Importa dati**

6. Verifica che:

      - La riga 1 contenga le intestazioni (`id`, `status`, `submitted_at`, `title`, ...)
      - Tutte le 50 righe abbiano lo stato `status = approved`
      - Ogni riga abbia un `id` da 1 a 50
      - Se hai usato l'opzione con Imgbb, la colonna `image_url` deve contenere gli URL di imgbb.

7. Ora puoi eliminare il file `scripts/init-data.csv` dal tuo computer - non serve più.

**Dopo l'importazione**, [attiva una sincronizzazione manuale]() su GitHub per verificare che tutto funzioni:

---

## 3. Gestione quotidiana

### 3.1 Revisione dei nuovi invii

Quando qualcuno invia un nuovo caso studio tramite il sito web:

1. Ricevi una **notifica via email** con i dettagli dello studio e un link al foglio.
2. Apri il Foglio Google - la nuova riga apparirà in fondo con `status = pending`.
3. Esamina i dati nella riga.
4. Cambia la cella `status` in:

      - **`approved`** - lo studio apparirà sul sito web dopo la successiva sincronizzazione.
      - **`denied`** - lo studio rimane nel foglio per archivio ma non apparirà sul sito web.
5. La successiva sincronizzazione notturna (alle 2:00 UTC) recepirà la modifica, oppure puoi [forzare una sincronizzazione manuale]().

> **Nota:** Nel form non si seleziona un `id`. Lo script di sincronizzazione assegna automaticamente il primo ID disponibile.

### 3.2 Modificare studi esistenti

Per modificare qualsiasi informazione di un caso studio:

1. Apri il Foglio Google.
2. Trova la riga interessata.
3. Modifica direttamente la cella - titolo, descrizione, coordinate, categorie NBS, ecc.
4. Le modifiche appariranno sul sito web dopo la successiva sincronizzazione.

### 3.3 Rimuovere uno studio

**Opzione A - Eliminazione logica (consigliata):** Cambia la colonna `status` in `denied`. Lo studio scompare dal sito web ma rimane nel foglio come archivio storico.

**Opzione B - Eliminazione fisica:** Elimina l'intera riga dal foglio di calcolo. Lo studio verrà rimosso dal sito web alla successiva sincronizzazione. Questa operazione non può essere annullata.

> Si consiglia di utilizzare l'Opzione A. L'Opzione B può causare problemi con i valori degli ID.

### 3.4 Forzare una sincronizzazione manuale

Invece di aspettare la sincronizzazione notturna (alle 2:00 UTC), puoi avviarla immediatamente:

1. Vai alla tua repository GitHub \> scheda **Actions**.
2. Clicca su **Nightly Sync Approved Studies** nella barra laterale sinistra.
3. Clicca su **Run workflow \> Run workflow**.
4. Attendi il completamento (segno di spunta verde).
5. Il sito web dovrebbe ora mostrare i dati sincronizzati dal foglio.

Puoi anche attivare una sincronizzazione dopo aver inviato (push) delle modifiche al codice:

- Il workflow **Deploy to GitHub Pages** viene eseguito automaticamente dopo ogni push sul ramo `main`.

---

## 4. Come funziona il Foglio Google (Excel esterno)

Il Foglio Google agisce come un **database esterno** che l'amministratore può gestire come un normale foglio di calcolo. Ecco come si inserisce nel sistema:

### Struttura del Foglio

Il foglio ha una scheda chiamata **"Submissions"** con una riga per ogni caso studio. Le colonne principali sono:

| Colonna | Scopo |
|------------------------------------------------------------------|------------------------------------------------------------------------------|
| `id` | ID numerico univoco (assegnato automaticamente dallo script di sincronizzazione per i nuovi invii) |
| `status` | Controlla la visibilità: `approved` = sul sito web, `denied` o `pending` = nascosto |
| `submitted_at` | Marca temporale (timestamp) di quando lo studio è stato inviato |
| `title`, `city`, `country`, `year` | Informazioni di base |
| `description`                                                    | Descrizione del progetto (testo libero) |
| `latitude`, `longitude`                                          | Coordinate per la mappa |
| `image_url`                                                      | URL dell'immagine del progetto (ospitata su imgbb) |
| `physical_innovation`, `social_innovation`, `digital_innovation` | Campi di testo per l'innovazione |
| `talea_application`, `size`, `climate_zone`                      | Classificazione principale |
| Da `a1_*` fino a `a7_*`                                          | Categorie di contesto fisico (valori separati da virgola) |
| Da `b1_*` fino a `b6_*`                                          | Vincoli e opportunità |
| Da `c1_*` fino a `c4_*`                                          | Processo di progettazione, finanziamenti, attori, obiettivi, servizi |
| Da `d1_*` fino a `d6_*`                                          | Elementi NBS (piante, pavimentazioni, acqua, tetti, arredi, spazi) |

### Cosa può fare il supervisore direttamente nel foglio

- **Approvare/rifiutare** gli invii modificando la cella `status`
- **Modificare qualsiasi campo** — le modifiche verranno acquisite alla successiva sincronizzazione
- **Aggiungere uno studio manualmente** — aggiungi una nuova riga con `status = approved` (la sincronizzazione assegnerà un ID)
- **Rimuovere uno studio** — imposta `status = denied` oppure elimina la riga
- **Modifiche in blocco** — usa le normali funzionalità del foglio di calcolo (trova/sostituisci, ordinamento, filtraggio)
- **Esportare** — scarica come file Excel/CSV da Google Sheets in qualsiasi momento

### Note importanti

- **Non rinominare o riordinare mai la riga delle intestazioni** — lo script di sincronizzazione si basa sui nomi esatti delle colonne in inglese
- **I valori delle categorie devono corrispondere esattamente** — usa gli stessi valori definiti in `src/data/filterConfig.js` (separati da virgola se multipli)
- **Non modificare manualmente l'ID**

---
