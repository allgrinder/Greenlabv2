import type { CatalogItem } from '../model/types';

/** Objektkatalog mit realen Maßen (m). Preise netto, Beispielwerte. */
export const ITEMS: CatalogItem[] = [
  { id: 'house', name: 'Wohnhaus', category: 'building', defaultLayer: 'build', width: 10, depth: 14, height: 7, symbol: 'house', creates: 'item', unit: 'pcs', price: 0 },
  { id: 'raised-bed-300x120', name: 'Hochbeet Lärche 300 × 120', category: 'raisedBed', defaultLayer: 'build', width: 3, depth: 1.2, height: 0.8, symbol: 'raisedBed', creates: 'item', unit: 'pcs', price: 289 },
  { id: 'shed-4x4', name: 'Gartenhaus 4 × 4 m', category: 'shed', defaultLayer: 'build', width: 4, depth: 4, height: 2.6, symbol: 'shed', creates: 'item', unit: 'pcs', price: 3900 },
  { id: 'terrace-wood', name: 'Terrasse, Holz', category: 'terrace', defaultLayer: 'areas', width: 4, depth: 3, height: 0, symbol: 'deck', creates: { area: 'wood' }, unit: 'm2', price: 0 },
  { id: 'pond', name: 'Teich', category: 'pond', defaultLayer: 'areas', width: 4, depth: 3, height: 0, symbol: 'pond', creates: { area: 'water' }, unit: 'm2', price: 0 },
  { id: 'pool-8x4', name: 'Pool 8 × 4 m', category: 'pool', defaultLayer: 'build', width: 8, depth: 4, height: 0, symbol: 'pool', creates: 'item', unit: 'pcs', price: 18500 },
  { id: 'play-swing', name: 'Spielturm Lärche mit Schaukel', category: 'play', defaultLayer: 'build', width: 4.5, depth: 3, height: 3, symbol: 'play', creates: 'item', unit: 'pcs', price: 1290 },
  { id: 'table-6', name: 'Tisch mit 6 Stühlen', category: 'furniture', defaultLayer: 'build', width: 2.6, depth: 3.6, height: 0.75, symbol: 'table', creates: 'item', unit: 'pcs', price: 1450 },
  { id: 'lounger', name: 'Liege', category: 'furniture', defaultLayer: 'build', width: 2.3, depth: 0.75, height: 0.4, symbol: 'lounger', creates: 'item', unit: 'pcs', price: 390 },
  { id: 'planter', name: 'Pflanzkübel Terrakotta', category: 'furniture', defaultLayer: 'build', width: 0.7, depth: 0.7, height: 0.6, symbol: 'planter', creates: 'item', unit: 'pcs', price: 120 },
  { id: 'fence-1m', name: 'Zaun, Lärche', category: 'fence', defaultLayer: 'build', width: 1, depth: 0.05, height: 1.2, symbol: 'fence', creates: 'item', unit: 'm', price: 64 },
  { id: 'greenhouse-4x3.5', name: 'Gewächshaus 4,0 × 3,5 m', category: 'greenhouse', defaultLayer: 'build', width: 4, depth: 3.5, height: 2.4, symbol: 'greenhouse', creates: 'item', unit: 'pcs', price: 2490 },
  { id: 'compost-2', name: 'Komposter, 2 Kammern', category: 'compost', defaultLayer: 'build', width: 1.75, depth: 2.5, height: 1, symbol: 'compost', creates: 'item', unit: 'pcs', price: 180 },
  { id: 'rain-barrel', name: 'Regentonne 300 l', category: 'compost', defaultLayer: 'build', width: 0.9, depth: 0.9, height: 1.1, symbol: 'barrel', creates: 'item', unit: 'pcs', price: 140 },
  { id: 'raised-bed-corten-300x100', name: 'Hochbeet Cortenstahl 300 × 100', category: 'raisedBed', defaultLayer: 'build', width: 3, depth: 1, height: 0.7, symbol: 'cortenBed', creates: 'item', unit: 'pcs', price: 640 },
  { id: 'office-pod', name: 'Homeoffice-Pod (Container 20 ft)', category: 'building', defaultLayer: 'build', width: 6.06, depth: 2.44, height: 2.6, symbol: 'container', creates: 'item', unit: 'pcs', price: 24900 },
  { id: 'pavilion-4x4', name: 'Pavillon mit Lamellendach 4 × 4 m', category: 'shed', defaultLayer: 'build', width: 4, depth: 4, height: 2.7, symbol: 'pergola', creates: 'item', unit: 'pcs', price: 8900 },
  { id: 'lounge-sofa', name: 'Loungesofa L-Form mit Tisch', category: 'furniture', defaultLayer: 'build', width: 2.8, depth: 2.2, height: 0.75, symbol: 'lounge', creates: 'item', unit: 'pcs', price: 2390 },
  { id: 'firepit-round', name: 'Feuerstelle rund mit Sesseln', category: 'furniture', defaultLayer: 'build', width: 5, depth: 5, height: 0.75, symbol: 'firepit', creates: 'item', unit: 'pcs', price: 3600 },
  { id: 'trampoline-ground', name: 'Bodentrampolin Ø 3 m', category: 'play', defaultLayer: 'build', width: 3, depth: 3, height: 0.06, symbol: 'trampoline', creates: 'item', unit: 'pcs', price: 990 },
  { id: 'gate-double', name: 'Gartentor zweiflüglig 2,2 m', category: 'fence', defaultLayer: 'build', width: 2.2, depth: 0.12, height: 1.4, symbol: 'gate', creates: 'item', unit: 'pcs', price: 1450 },
  { id: 'stone-wall-1m', name: 'Natursteinmauer, trocken', category: 'fence', defaultLayer: 'build', width: 1, depth: 0.45, height: 0.8, symbol: 'stoneWall', creates: 'item', unit: 'm', price: 260 },
  { id: 'basalt-boulders', name: 'Basalt-Findlinge, 3er-Gruppe', category: 'furniture', defaultLayer: 'build', width: 1.6, depth: 1.2, height: 0.7, symbol: 'basaltBoulders', creates: 'item', unit: 'pcs', price: 680 },
  { id: 'basalt-columns', name: 'Basaltstelen, 5er-Gruppe', category: 'furniture', defaultLayer: 'build', width: 1.0, depth: 0.8, height: 1.4, symbol: 'basaltColumns', creates: 'item', unit: 'pcs', price: 890 },
  { id: 'deck-bench', name: 'Einbaubank Lärche mit Pflanzkasten', category: 'furniture', defaultLayer: 'build', width: 3.2, depth: 0.55, height: 0.45, symbol: 'deckBench', creates: 'item', unit: 'pcs', price: 1680 },
  { id: 'edge.kantenstein-8x20', name: 'Kantenstein 8 × 20 × 100', category: 'edging', defaultLayer: 'paths', width: 1, depth: 0.08, height: 0.2, symbol: 'edge', creates: 'item', unit: 'm', price: 6.4 },
  { id: 'edge.stahl-anthrazit', name: 'Rasenkante Stahl, anthrazit', category: 'edging', defaultLayer: 'paths', width: 1, depth: 0.004, height: 0.15, symbol: 'edgeSteel', creates: 'item', unit: 'm', price: 18.5 },
  { id: 'edge.corten', name: 'Rasenkante Cortenstahl', category: 'edging', defaultLayer: 'paths', width: 1, depth: 0.004, height: 0.15, symbol: 'edgeCorten', creates: 'item', unit: 'm', price: 21 },
  // Erweiterung: Bauten, Möbel & Schatten, Spielen, Deko, Wasser, Technik, Rankhilfen, Zäune & Mauern (Blender: assets/blender/items_*.py)
  { id: 'carport-flachdach-stahl', name: 'Carport Flachdach Stahl anthrazit 3,2 × 5,5 m', category: 'building', defaultLayer: 'build', width: 3.2, depth: 5.5, height: 2.6, symbol: 'carportFlat', creates: 'item', unit: 'pcs', price: 2890 },
  { id: 'geraeteschuppen-pultdach-klein', name: 'Geräteschuppen Pultdach Rhombusleisten 2,0 × 1,5 m', category: 'shed', defaultLayer: 'build', width: 2, depth: 1.5, height: 2.1, symbol: 'toolShedMono', creates: 'item', unit: 'pcs', price: 1490 },
  { id: 'fahrradunterstand-gruendach', name: 'Fahrradunterstand mit Gründach 2,2 × 1,8 m', category: 'shed', defaultLayer: 'build', width: 2.2, depth: 1.8, height: 2, symbol: 'bikeShelter', creates: 'item', unit: 'pcs', price: 1890 },
  { id: 'muelltonnenbox-2er-pflanzdach', name: 'Mülltonnenbox für 2 Tonnen mit Pflanzdach, Stahl/Holz', category: 'shed', defaultLayer: 'build', width: 1.5, depth: 0.8, height: 1.25, symbol: 'binStore2', creates: 'item', unit: 'pcs', price: 649 },
  { id: 'fasssauna-thermoholz', name: 'Fasssauna Thermoholz mit Vordach 2,2 × 3,0 m', category: 'building', defaultLayer: 'build', width: 2.2, depth: 3, height: 2.3, symbol: 'barrelSauna', creates: 'item', unit: 'pcs', price: 7900 },
  { id: 'huehnerstall-mit-auslauf', name: 'Hühnerstall mit Auslauf und Nistkasten 2,5 × 1,5 m', category: 'building', defaultLayer: 'build', width: 2.5, depth: 1.5, height: 1.6, symbol: 'chickenCoop', creates: 'item', unit: 'pcs', price: 789 },
  { id: 'outdoorkueche-gasgrill', name: 'Outdoorküche Beton/Edelstahl mit Gasgrill und Spüle 2,6 m', category: 'furniture', defaultLayer: 'build', width: 2.6, depth: 0.8, height: 0.95, symbol: 'outdoorKitchen', creates: 'item', unit: 'pcs', price: 4990 },
  { id: 'hollywoodschaukel', name: 'Hollywoodschaukel mit Sonnendach', category: 'furniture', defaultLayer: 'build', width: 2.1, depth: 1.4, height: 1.9, symbol: 'hollywoodSwing', creates: 'item', unit: 'pcs', price: 549 },
  { id: 'haengematte-gestell', name: 'Hängematte mit Stahlgestell', category: 'furniture', defaultLayer: 'build', width: 3.2, depth: 1.1, height: 1.1, symbol: 'hammockStand', creates: 'item', unit: 'pcs', price: 319 },
  { id: 'gartenbank-holz-stahl', name: 'Gartenbank Holz/Stahl', category: 'furniture', defaultLayer: 'build', width: 1.6, depth: 0.6, height: 0.85, symbol: 'gardenBench', creates: 'item', unit: 'pcs', price: 389 },
  { id: 'bistro-set', name: 'Bistro-Set (Tisch rund + 2 Stühle)', category: 'furniture', defaultLayer: 'build', width: 1.4, depth: 1, height: 0.75, symbol: 'bistroSet', creates: 'item', unit: 'pcs', price: 299 },
  { id: 'sonnenschirm-rund-3m', name: 'Sonnenschirm rund Ø 3 m mit Ständer', category: 'furniture', defaultLayer: 'build', width: 3, depth: 3, height: 2.5, symbol: 'parasolRound', creates: 'item', unit: 'pcs', price: 429 },
  { id: 'sonnensegel-dreieck', name: 'Sonnensegel dreieckig 5 × 4 m mit 3 Masten', category: 'furniture', defaultLayer: 'build', width: 5, depth: 4, height: 2.8, symbol: 'shadeSail', creates: 'item', unit: 'pcs', price: 1290 },
  { id: 'kugelgrill', name: 'Kugelgrill Ø 57 cm', category: 'furniture', defaultLayer: 'build', width: 0.65, depth: 0.65, height: 1, symbol: 'kettleGrill', creates: 'item', unit: 'pcs', price: 329 },
  { id: 'sandbox-bench-200', name: 'Sandkasten Lärche mit Bankdeckel 2 × 2 m', category: 'play', defaultLayer: 'build', width: 2, depth: 2, height: 0.35, symbol: 'sandboxBench', creates: 'item', unit: 'pcs', price: 590 },
  { id: 'slide-freestanding', name: 'Rutsche freistehend mit Leiter', category: 'play', defaultLayer: 'build', width: 3.2, depth: 0.8, height: 1.7, symbol: 'slideTower', creates: 'item', unit: 'pcs', price: 1190 },
  { id: 'soccer-goal-300', name: 'Fußballtor Alu 3 × 2 m', category: 'play', defaultLayer: 'build', width: 3, depth: 1.2, height: 2, symbol: 'soccerGoal', creates: 'item', unit: 'pcs', price: 349 },
  { id: 'table-tennis-outdoor', name: 'Tischtennisplatte outdoor', category: 'play', defaultLayer: 'build', width: 2.74, depth: 1.525, height: 0.76, symbol: 'pingPongTable', creates: 'item', unit: 'pcs', price: 890 },
  { id: 'stilt-house', name: 'Stelzenhaus mit Leiter', category: 'play', defaultLayer: 'build', width: 2.4, depth: 2.4, height: 3.4, symbol: 'stiltHouse', creates: 'item', unit: 'pcs', price: 2890 },
  { id: 'boulder-granite', name: 'Findling Granit', category: 'deco', defaultLayer: 'build', width: 1.2, depth: 0.9, height: 0.7, symbol: 'graniteBoulder', creates: 'item', unit: 'pcs', price: 420 },
  { id: 'bird-bath', name: 'Vogeltränke auf Betonsockel', category: 'deco', defaultLayer: 'build', width: 0.6, depth: 0.6, height: 0.8, symbol: 'birdBath', creates: 'item', unit: 'pcs', price: 189 },
  { id: 'insect-hotel', name: 'Insektenhotel auf Pfosten', category: 'deco', defaultLayer: 'build', width: 0.6, depth: 0.3, height: 1.6, symbol: 'insectHotel', creates: 'item', unit: 'pcs', price: 129 },
  { id: 'nest-box-pole', name: 'Nistkasten am Pfahl', category: 'deco', defaultLayer: 'build', width: 0.3, depth: 0.3, height: 2.2, symbol: 'nestBoxPole', creates: 'item', unit: 'pcs', price: 89 },
  { id: 'sculpture-corten', name: 'Skulptur Cortenstahl „Flamme“', category: 'deco', defaultLayer: 'build', width: 0.6, depth: 0.6, height: 1.8, symbol: 'cortenSculpture', creates: 'item', unit: 'pcs', price: 1650 },
  { id: 'planter-fibrecement-100', name: 'Pflanzkübel Faserzement 100 × 100, bepflanzt', category: 'deco', defaultLayer: 'build', width: 1, depth: 1, height: 0.9, symbol: 'planterLarge', creates: 'item', unit: 'pcs', price: 690 },
  { id: 'spring-stone', name: 'Quellstein Granit im Kiesbett', category: 'water', defaultLayer: 'build', width: 0.9, depth: 0.9, height: 0.6, symbol: 'springStone', creates: 'item', unit: 'pcs', price: 1150 },
  { id: 'water-table-corten', name: 'Wassertisch Cortenstahl mit Sprudel', category: 'water', defaultLayer: 'build', width: 1.2, depth: 1.2, height: 0.7, symbol: 'waterTable', creates: 'item', unit: 'pcs', price: 2890 },
  { id: 'cistern-underground', name: 'Regenwasserzisterne unterirdisch (Domdeckel)', category: 'water', defaultLayer: 'build', width: 0.8, depth: 0.8, height: 0.05, symbol: 'cisternLid', creates: 'item', unit: 'pcs', price: 3200 },
  { id: 'hand-pump', name: 'Schwengelpumpe auf Natursteinplatte', category: 'water', defaultLayer: 'build', width: 0.6, depth: 0.5, height: 1.3, symbol: 'handPump', creates: 'item', unit: 'pcs', price: 690 },
  { id: 'power-post', name: 'Außensteckdosensäule, 2-fach mit LED', category: 'tech', defaultLayer: 'build', width: 0.2, depth: 0.2, height: 0.9, symbol: 'powerPost', creates: 'item', unit: 'pcs', price: 340 },
  { id: 'tap-post', name: 'Wasserzapfsäule Edelstahl mit Ablaufrost', category: 'tech', defaultLayer: 'build', width: 0.25, depth: 0.25, height: 0.9, symbol: 'tapPost', creates: 'item', unit: 'pcs', price: 480 },
  { id: 'mower-garage', name: 'Mähroboter mit Garage und Ladestation', category: 'tech', defaultLayer: 'build', width: 0.9, depth: 0.8, height: 0.45, symbol: 'mowerGarage', creates: 'item', unit: 'pcs', price: 1590 },
  { id: 'hose-reel', name: 'Schlauchwagen mit 30 m Schlauch', category: 'tech', defaultLayer: 'build', width: 0.6, depth: 0.5, height: 0.8, symbol: 'hoseReel', creates: 'item', unit: 'pcs', price: 129 },
  { id: 'rose-arch', name: 'Rosenbogen Stahl, mit Kletterrose', category: 'fence', defaultLayer: 'build', width: 1.4, depth: 0.5, height: 2.3, symbol: 'roseArch', creates: 'item', unit: 'pcs', price: 320 },
  { id: 'trellis-wall', name: 'Rankwand mit Pflanztrog, Sternjasmin', category: 'fence', defaultLayer: 'build', width: 2, depth: 0.25, height: 1.9, symbol: 'trellisWall', creates: 'item', unit: 'pcs', price: 890 },
  { id: 'climb-obelisk', name: 'Rankobelisk Stahl, mit Clematis', category: 'fence', defaultLayer: 'build', width: 0.5, depth: 0.5, height: 1.8, symbol: 'climbObelisk', creates: 'item', unit: 'pcs', price: 165 },
  { id: 'fence-dsm-anthracite-250', name: 'Doppelstabmattenzaun anthrazit, Feld 2,5 m', category: 'fence', defaultLayer: 'build', width: 2.5, depth: 0.1, height: 1.4, symbol: 'dsmFence', creates: 'item', unit: 'm', price: 58 },
  { id: 'fence-privacy-larch-180', name: 'Sichtschutzzaun Lärche vergraut, Lamellen 1,8 m', category: 'fence', defaultLayer: 'build', width: 1.8, depth: 0.1, height: 1.8, symbol: 'larchScreen', creates: 'item', unit: 'm', price: 165 },
  { id: 'fence-bamboo-180', name: 'Bambusmatte als Sichtschutz an Pfosten', category: 'fence', defaultLayer: 'build', width: 1.8, depth: 0.08, height: 1.8, symbol: 'bambooScreen', creates: 'item', unit: 'm', price: 48 },
  { id: 'gate-single-anthracite-120', name: 'Gartenpforte einflüglig, anthrazit', category: 'fence', defaultLayer: 'build', width: 1.2, depth: 0.1, height: 1.2, symbol: 'gardenGate', creates: 'item', unit: 'pcs', price: 420 },
  { id: 'wall-gabion-200', name: 'Gabionenwand, Steinfüllung Granit', category: 'fence', defaultLayer: 'build', width: 2, depth: 0.3, height: 1.2, symbol: 'gabionWall', creates: 'item', unit: 'm', price: 210 },
  { id: 'wall-l-stone-80', name: 'L-Stein / Winkelstützelement Beton 80 cm', category: 'fence', defaultLayer: 'build', width: 1, depth: 0.6, height: 0.8, symbol: 'lStone', creates: 'item', unit: 'm', price: 95 },
  { id: 'raised-bed-stone-200x100', name: 'Hochbeet aus Naturstein 200 × 100', category: 'raisedBed', defaultLayer: 'build', width: 2, depth: 1, height: 0.6, symbol: 'stoneRaisedBed', creates: 'item', unit: 'pcs', price: 1350 },
  { id: 'edge-palisade-40', name: 'Holzpalisaden-Einfassung, Rundholz Ø 12 cm', category: 'fence', defaultLayer: 'build', width: 1, depth: 0.12, height: 0.4, symbol: 'palisadeEdge', creates: 'item', unit: 'm', price: 34 },
  { id: 'steps-block-concrete-3', name: 'Blockstufen Beton, 3 Stufen 120 cm', category: 'terrace', defaultLayer: 'build', width: 1.2, depth: 1.05, height: 0.45, symbol: 'blockSteps', creates: 'item', unit: 'pcs', price: 390 },
];

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

/** Was die Bibliothek unter „Bauten & Ausstattung“ anbietet: alles außer Einfassungen (die gibt es an Flächen, Wegen und Beeten) */
export const LIBRARY_ITEMS = ITEMS.filter((i) => i.category !== 'edging');

/** Einfassungen zur Wahl an Flächen, Wegen und Beeten */
export const EDGINGS: [string | null, string][] = [
  [null, 'Ohne'],
  ['edge.kantenstein-8x20', 'Stein'],
  ['edge.stahl-anthrazit', 'Stahl'],
  ['edge.corten', 'Corten'],
];

export function getItem(id: string): CatalogItem {
  const it = BY_ID.get(id);
  if (!it) throw new Error(`Unbekanntes Katalogobjekt: ${id}`);
  return it;
}
