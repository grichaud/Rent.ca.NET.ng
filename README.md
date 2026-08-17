# Rent.ca.NET.ng

[![Live on Azure](https://img.shields.io/badge/Live%20on-Azure%20App%20Service-0078D4?logo=microsoftazure&logoColor=white)](https://rent-ca-net-ng.azurewebsites.net/en)
[![Angular 22](https://img.shields.io/badge/Angular-22-DD0031?logo=angular&logoColor=white)](https://angular.dev)
[![.NET 9](https://img.shields.io/badge/.NET-9-512BD4?logo=dotnet&logoColor=white)](https://dotnet.microsoft.com)

> **Angular front end over a .NET 9 Web API** &mdash; the third build of the same product, a marketplace for Canadian rentals.

Live: **https://rent-ca-net-ng.azurewebsites.net/en**

The same product exists in three stacks, on purpose. Each one is a full build of the same data model and the same feature slice, so the interesting part is not the app &mdash; it is what changes when the stack changes.

| | First build | Second build | This repo |
| --- | --- | --- | --- |
| Front end | Next.js 16 (App Router) | ASP.NET Core Razor Pages | **Angular 22 + SSR** |
| Back end | Next.js server / Supabase | ASP.NET Core 9 (same app) | **.NET 9 Web API (separate)** |
| Database | Supabase (Postgres) | SQL Server | **Azure SQL** |
| Auth | Supabase Auth | ASP.NET Core Identity | ASP.NET Core Identity + Google |
| Hosting | Vercel | Azure App Service | Azure App Service |

**The architectural difference that matters here:** in the Razor Pages build the UI and the API live in one application. In this one they are **two deployables** &mdash; an Angular client and a .NET Web API that only speaks JSON. Splitting them is what forced every contract to be explicit.

## Stack

- **Angular 22.1** &mdash; standalone components, server-side rendering via `@angular/ssr` and `@angular/platform-server`
- **TypeScript 6.0**, **Tailwind CSS 3.4**
- **.NET 9 Web API** (`src/Rent.Api`) &mdash; EF Core, ASP.NET Core Identity, Google OAuth
- **Azure SQL**, **Azure Blob Storage** for listing images
- **xUnit** for the API (`tests/Rent.Api.Tests`), **Playwright** for end-to-end coverage across seven spec files
- **GitHub Actions** &mdash; CI on push, deploy to Azure App Service, and a scheduled job for listing alerts

## Features

Public listings with server-side rendering for SEO, search and filtering, listing detail with map, landlord portal (create / edit / deactivate listings, multi-photo upload, inquiry inbox), renter accounts with favourites, an AI assistant over the listing data, email alerts for new listings, and **bilingual routing under `/en` and `/fr`**.

## Layout

```
src/Rent.Api/        .NET 9 Web API — vertical slices per feature
src/rent-client/     Angular 22 client (SSR)
tests/Rent.Api.Tests xUnit
scripts/             validation scripts per feature area
.github/workflows/   ci · deploy · alerts
```

## Running it

```bash
# API
dotnet run --project src/Rent.Api

# client
cd src/rent-client && npm install && npm start
```

The API reads its configuration from user secrets / environment variables &mdash; connection string, Google OAuth credentials, blob storage and mail settings. Nothing sensitive is committed to this repository.

---

**This is a demo, not a commercial site.** It runs on seed data and is not affiliated with any existing rental company. Built and documented from source, 2026.

> **Note on the `Alerts` workflow:** it runs on a schedule, and this repository is public, so GitHub's 60-day auto-disable applies &mdash; after 60 days with no repository activity the schedule is switched off and does not come back on its own. Check the Actions tab if the digest goes quiet.
