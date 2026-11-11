# NBS Toolkit

[🇮🇹 Versione in italiano qui](#nbs-toolkit-versione-italiana)

## TALEA Nature-Based Solutions Toolkit (Abacus of Hardware Solutions)

## Description

The NBS Toolkit is a structured and filterable repository of nature-based and nature-base-like solutions adopted worldwide to support climate adaptation, urban resilience, and green transition strategies.\
It represents the digital evolution of the TALEA Abacus of Hardware Solutions.

The Toolkit supports planners, designers, public administrations and researchers in identifying, evaluating and adapting green solutions to local conditions.

## Data Source

All case study data, filter categories, and classification logic are derived from the **TALEA D6.2.1 - Abacus of Hardware Solutions** research deliverable, included in `public/`. The Excel file contains one sheet per case study with structured fields for physical characteristics (A), constraints and opportunities (B), design process and goals (C), and NBS elements (D).

To extract data from the Excel file, run:

```bash
node scripts/extract-excel.js
```

This script read every sheet from the workbook generating `src/data/caseStudies.json`. The script only needs to be run once, after that, the Google Sheet becomes the single source of truth and all updates flow through the submissions + nightly sync pipeline.

>**Note:** The `caseStudies.json` file has already been extracted and correctly uploaded to the repository. It is not strictly necessary to repeat this step unless you are making changes to the original Excel file.

## Features

- **Search** - Fuzzy text search with automatic filter chip suggestions and slash commands
- **AI Assistant** - Describe your site, its problems and limits in any language: the search finds the closest case studies (tags, words and meaning) and an AI expert selects up to 5 and explains why they fit. Keeps working in the background if the panel is closed.
- **Filter Canvas** - Visual query builder with drag-and-drop filters, AND/OR logic, and include/exclude (NOT) support
- **Grid / List / Map** - Card grid, compact table, or interactive map with Street View link, Geo URI and OpenStreetMap link
- **Compare** - Side-by-side comparison of 2-3 selected studies
- **Statistics** - Charts for NBS distribution, top countries, climate zones, and size breakdown
- **Export** - Download filtered results as PDF, CSV or Excel
- **Submit** - Public form to propose a new case studies, with supervisor review workflow
- **Favorites** - Bookmark studies locally for quick access
- **Dark / Light theme**

## External Services

The app is fully client-side with no traditional backend. It relies on the following external services:

| Service                | Purpose                                                                                                                                                                                                                                          |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **GitHub Pages**       | Hosts the production build. Deployed from the `gh-pages` branch automatically on push and nightly sync.                                                                                                                                          |
| **GitHub Actions**     | Two workflows: one deploys on push to `main`, the other runs a nightly cron job to sync new data from the Google Sheet.                                                                                                                          |
| **Google Sheets**      | Act as the primary database where all case study data is managed. New submissions land here for supervisor review.                                                                                                                               |
| **Google Apps Script** | Receives form submissions from the website, writes them to the Google Sheet, saves the images in a Drive folder and emails the supervisor for review.                                                                                            |
| **Cloudflare Worker**  | Serverless proxy between the frontend and the AI services. Handles CORS, the daily limit per visitor (D1, keyed by a daily hash of the IP; the IP is not stored), and keeps the API keys secret. |
| **Google Gemini**      | AI model that understands the question and judges the candidate cases: `gemini-3.5-flash-lite` on the free tier, with `gemini-3.1-flash-lite` as backup when the daily quota is used up. |
| **Cloudflare Workers AI** | `bge-m3` vectors (multilingual) of the questions and of the case studies, used to compare their meaning. Case vectors are in `public/data/case-embeddings.json`, updated by the nightly sync. |
| **Cloudflare D1**      | Daily counters per visitor and anonymous log of the AI questions (`talea-ai-log`: day, question, selected cases; no IP), kept 180 days, to improve the search. |

## Current Deploy

The production site is served via **GitHub Pages** from the `gh-pages` branch. The active AI proxy is the **Cloudflare Worker** running `worker-gemini.js` with the **Google Gemini** API and Workers AI.

AI search, in short: the worker asks Gemini to turn the question into a search plan (`/api/understand`); the browser ranks the cases with the plan (`src/utils/aiRetrieval.js`: explicit constraints, rarity-weighted tags, BM25 on the English texts, vector similarity, rank fusion); the worker asks Gemini to judge the 15 closest cases (`/api/judge`); the browser checks the answer (`src/utils/aiSearchV2.js`). Setting `REACT_APP_AI_SEARCH=v1` at build time brings back the previous Quick/Deep search.

This setup is designed with a **modular, future-proof approach:** while Gemini is the primary provider at the moment, the architecture is not static and allows for seamlessly switching AI models or providers based on future needs.

Images are stored in the repository (`public/images/`) and published with the site. Images of new submissions are saved in the Google Drive folder of the Sheet; the nightly sync copies them into the repository when the case is approved.

## Setup and Administration

**For future maintainers and administrators:**

To configure the external services, manage the API keys, or review incoming case study submissions, please refer to the [Admimistrator guide](/nbstoolkit/Administrator_Setup_guide.md). It contains the complete setup instrcutions and architectural details.

---

# NBS Toolkit (Versione Italiana)

[🇬🇧 English version here](#nbs-toolkit)

## TALEA Nature-Based Solutions Toolkit (Abacus of Hardware Solutions)

## Descrizione

Il Toolkit NBS è un repository strutturato e filtrabile contenente soluzioni basate sulla natura (e simili) adottate in tutto il mondo per supportare l'adattamento climatico, la resilienza urbana e le strategie di verdificazione.\
Rappresenta l'evoluzione digitale del "Talea Abacus of Hardware Solutions".

Il Tookit supporta progettisti urbani, pubblica amministrazione e ricercatori nell'indentificare, valutare e adattare soluzioni verdi alle proprie condizioni locali.

## Origine dei Dati

Tutti i dati, partendo dai casi studio, alle categorie di filtri e alle logiche di classificazione derivano dal deliverable di ricerca **TALEA D6.2.1 - Abacus of Hardware Solutions**, incluso nella directory `public/`. Il file Excel contiene un foglio per ogni caso con campi strutturati per caratteristiche fisiche (A), vincoli e opportunità (B), processi e obiettivi del progetto (C) ed elementi NBS (D).

Per estrarre i dati dal file Excel, esegui:

```bash
node scripts/extract-excel.js
```

Questo script legge ogni foglio dell' Excel `src/data/caseStudies.json`. Lo script deve essere eseguito una sola volta: successivamente, il Google Sheet diventa l'unica "fonte di verità" e tutti gli aggiornamenti passano attraverso il flusso relativo all'invio di form e sincronizzazione notturna.

> **Nota bene:** il file `caseStudies.json`. è già stato estratto e caricato correttamente nella repository. Non è necessario ripetere questo passaggio, a meno che non vengano apportate modifiche al file Excel originale.

## Funzionalità

- **Ricerca** - Ricerca testuale fuzzy con suggerimenti automatici per i filtri e compandi slash.
- **Assistente AI** - Descrivi in qualsiasi lingua il tuo luogo, i problemi e i limiti: la ricerca trova i casi studio più vicini (tag, parole e significato) e un esperto AI ne sceglie fino a 5 spiegando perché sono adatti. Continua a lavorare anche se il pannello viene chiuso.
- **Filter Canvas** - Costruttuore visivo di query con filtri drag-and-drop, logica AND/OR e supporto per inclusione/esclusione (NOT).
- **Griglia / Lista / Mappa** - Segli tra griglia a scheda, tabella compatta o mappa interattiva con link a Street View, Geo URI e OpenStreetMap.
- **Confronto** - Comparazione fianco a fianco di 2-3 casi studio selezionati.
- **Statistiche** - Grafici per la distribuzione delle NBS, paesi principali, zone climatiche e suddivisione per dimensinoe.
- **Esportazione** - Scarca i risultati filtrati in formato PDf, CSV e Excel.
- **Submit** - Modulo pubblico per proporre nuovi casi studio, con revisione di un supervisore.
- **Preferiti** - Salva i casi studio in locale nel browser per un accesso rapido.
- **Tema Scuro / Chiaro**

## Servizi Esterni

L'applicazione è interamente lato client e non ha un backend tradizionale. Si affida ai seguenti servizi esterni:

| Servizio               | Scopo                                                                                                                                                                                                                                                      |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **GitHub Pages**       | Ospita la build di produzione. Il deploy avviene automaticamente dal branch `gh-pages` ad ogni push e tramite sincronizzazione notturna.                                                                                                                   |
| **GitHub Actions**     | Due flussi di lavoro: uno effettua il deploy su `main`, l'altro esegue un cron job notturno per sincronizzare i nuovi dati dal Google Sheet.                                                                                                               |
| **Google Sheets**      | Funge da database principale dove vengono gestiti tutti i dati dei casi studio. Le nuove proposte arrivano qui per la revisione del supervisore.                                                                                                           |
| **Google Apps Script** | Riceve i dati inviati dal modulo web, li scrive nel Google Sheet, salva le immagini in una cartella Drive e invia un'email al supervisore per la revisione.                                                                                                |
| **Cloudflare Worker**  | Proxy serverless tra il frontend e i servizi IA. Gestisce i CORS, il limite giornaliero per visitatore (D1, con un hash giornaliero dell'IP; l'IP non viene salvato) e mantiene segrete le chiavi API. |
| **Google Gemini**      | Modello IA che interpreta la domanda e valuta i casi candidati: `gemini-3.5-flash-lite` (piano gratuito), con `gemini-3.1-flash-lite` di riserva quando finisce la quota del giorno. |
| **Cloudflare Workers AI** | Vettori `bge-m3` (multilingue) delle domande e dei casi studio, per confrontarne il significato. I vettori dei casi sono in `public/data/case-embeddings.json`, aggiornati dalla sincronizzazione notturna. |
| **Cloudflare D1**      | Contatori giornalieri per visitatore e registro anonimo delle domande all'AI (`talea-ai-log`: giorno, domanda, casi scelti; nessun IP), conservato 180 giorni, per migliorare la ricerca. |

## Deplyment Attuale

Il sito in produzione è ospitato via **GitHub Pages** dal branch `gh-pages`. Il proxy IA attivo è il **Cloudflare Worker** che esegue `worker-gemini.js` tramite l'API di **Google Gemini** e Workers AI.

La ricerca AI, in breve: il worker chiede a Gemini di trasformare la domanda in un piano di ricerca (`/api/understand`); il browser ordina i casi con il piano (`src/utils/aiRetrieval.js`: vincoli espliciti, tag pesati per rarità, BM25 sui testi inglesi, somiglianza dei vettori, fusione delle classifiche); il worker chiede a Gemini di valutare i 15 casi più vicini (`/api/judge`); il browser controlla la risposta (`src/utils/aiSearchV2.js`). Con `REACT_APP_AI_SEARCH=v1` nella build si torna alla ricerca precedente Quick/Deep.

Questo setup è stato progettato con un **approccio modulare e orientato al futuro:** sebbene Gemini sia attualmente il fornitore principale, l'architettura non è statica e permette di passare senza problemi ad altri modelli o fornitori IA in base alle esigenze future.

Le immagini sono nella repository (`public/images/`) e vengono pubblicate con il sito. Le immagini delle nuove proposte vengono salvate nella cartella Google Drive dello Sheet; la sincronizzazione notturna le copia nella repository quando il caso viene approvato.

## Setup e Amministrazione

**Per i futuri manutentori e amministratori:**

Per configurare i servizi esterni, gestire le chiavi API o revisionare le nuove proposte di casi studio, si prega di fare riferimento alla [Guida per l'Amministrazione](/nbstoolkit/Administrator_Setup_guide.md). Contiene istruzioni complete per l'installazione e tutti i dettagli architettonici.
