# Open Access Lens

A visual tool to explore healthcare accessibility across the globe using isochrones. Linkin to HDX for download and vice versa for quick visuals

## Overview

Open Access Lens visualizes travel time and distance to healthcare facilities (Hospitals, Primary Healthcare) and educational institutions. It provides:
- **Global View**: Interactive overview of country coverage.
- **Dashboard View**: Detailed breakdown of population reach within specific time or distance ranges.

## Technology Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Map**: MapLibre GL JS
- **Data**: PMTiles (Efficient serverless map tiles)
- **Styling**: Tailwind CSS

## Architecture

Data is visualized directly from client-side PMTiles, requiring no backend tile server. Metadata and boundaries are fetched dynamically based on the selected country.

## Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (v9 or higher recommended)

### Setup
Install dependencies:
```bash
npm install
```

### Run Locally
Start the development server with hot-reload:
```bash
npm run dev
```
Visit `http://localhost:5173` (or the port shown in your terminal).

### Build for Production
Type-check and build the project for production:
```bash
npm run build
```
The output will be in the `dist` directory.

## License

GNU GPLv3
