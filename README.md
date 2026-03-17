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
- **AI Assistant** - Natural-language search powered by Google Gemini (**interchangeable AI backend**), with **Deep Research** mode that uses expert-level analysis.
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
| **Google Apps Script** | Receives form submissions from the website, writes them to the Google Sheet, and emails the supervisor for review.                                                                                                                               |
| **imgbb**              | Free image hosting. Case study images are uploaded here during submission and referenced by URL in the dataset.                                                                                                                                  |
| **Cloudflare Worker**  | Serverless proxy between the frontend and the AI model API. Handles CORS, rate limiting (KV store), and keeps the API key secret.                                                                                                                |
| **Google Gemini**      | AI model used for natural-language search and deep research analysis. Currently using `gemini-3.1-flash-lite` on the free tier. The system uses a **provider-agnostic architecture**, allowing for easy switching between model and providers.   |

## Current Deploy

The production site is served via **GitHub Pages** from the `gh-pages` branch. The active AI proxy is the **Cloudflare Worker** running `worker-gemini.js` with the **Google Gemini** API.

This setup is designed with a **modular, future-proof approach:** while Gemini is the primary provider at the moment, the architecture is not static and allows for seamlessly switching AI models or providers based on future needs.

Images are hosted on **imgbb**.

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
- **Assistente AI** - Ricerca in linguaggio naturale basato su Google Gemini ( **backend AI intercambiabile**), con modalità **Deep Research** basata su un'analisi più approfondita dei casi di studio.
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
| **Google Apps Script** | Riceve i dati inviati dal modulo web, li scrive nel Google Sheet e invia un'email al supervisore per la revisione.                                                                                                                                         |
| **imgbb**              | Hosting gratuito di immagini. Le immagini dei casi studio vengono caricate qui durante l'invio e referenziate tramite URL nel dataset.                                                                                                                     |
| **Cloudflare Worker**  | Proxy serverless tra il frontend e l'API del modello IA. Gestisce i CORS, il rate limiting (KV store) e mantiene segreta la chiave API.                                                                                                                    |
| **Google Gemini**      | Modello IA utilizzato per la ricerca in linguaggio naturale e l'analisi deep research. Attualmente usa `gemini-3.1-flash-lite` (piano gratuito). Il sistema adotta un'**architettura agnostica**, che permette di cambiare facilmente modello e fornitore. |

## Deplyment Attuale

Il sito in produzione è ospitato via **GitHub Pages** dal branch `gh-pages`. Il proxy IA attivo è il **Cloudflare Woeker** che esegue `worker-gemini.js` tramite l'API di **Google Gemini**.

Questo setup è stato progettato con un **approccio modulare e orientato al futuro:** sebbene Gemini sia attualmente il fornitore principale, l'architettura non è statica e permette di passare senza problemi ad altri modelli o fornitori IA in base alle esigenze future.

Le immagini sono ospitate su **imgbb**.

## Setup e Amministrazione

**Per i futuri manutentori e amministratori:**

Per configurare i servizi esterni, gestire le chiavi API o revisionare le nuove proposte di casi studio, si prega di fare riferimento alla [Guida per l'Amministrazione](/nbstoolkit/Administrator_Setup_guide.md). Contiene istruzioni complete per l'installazione e tutti i dettagli architettonici.
