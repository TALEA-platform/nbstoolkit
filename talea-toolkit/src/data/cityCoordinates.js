// Static lat/lng coordinates for case study project sites
// id → [lat, lng] — pointing to the ACTUAL project location, not generic city center
const cityCoordinates = {
  1:  [50.0614, 19.9365],   // Anti-smog Educational Garden — school courtyard pilot, Krakow (Nowa Huta area)
  2:  [45.4856, 9.1904],    // Bosco Verticale — Via Gaetano de Castillia 11, Porta Nuova, Milan
  3:  [52.0806, 5.1222],    // Catharijnesingel Canal Re-opening — restored canal section, central Utrecht
  4:  [47.4852, 19.0800],   // CoolCo's Cooling Corners — Szigony utca, Jozsefvaros (8th district), Budapest
  5:  [6.2518, -75.5636],   // Corredores Verdes — Avenida Oriental green corridor, central Medellin
  6:  [41.3998, 2.1710],    // Corredor Verde Passeig de Sant Joan — Passeig de Sant Joan, Eixample, Barcelona
  7:  [41.0942, 16.8468],   // Corte Don Bosco — Via Altamura / Via Cozzoli, San Paolo district, Bari
  8:  [37.3824, -5.9569],   // Gardens in the Air (Jardines en el Aire) — Candelilla 6, Tres Barrios-Amate, Seville
  9:  [51.0565, 3.7250],    // Green Elderly Care — elderly care garden, east Ghent
  10: [41.6443, -4.7335],   // Green Noise Barrier — Paseo del Hospital Militar, Valladolid
  11: [41.6558, -4.7220],   // Green Shady Structure — Calle Zuniga / Calle Sta. Maria, downtown Valladolid
  12: [50.8233, 4.3700],    // Greening of Flagey & Sainte-Croix Squares — Place Flagey, Ixelles, Brussels
  13: [59.3020, 18.0883],   // Hammarby Sjostad — eco-district south of Sodermalm, Stockholm
  14: [-12.0460, -77.0310], // Invasion Verde — Pasaje Encarnacion, historic center, Lima
  15: [48.9073, 2.3870],    // Jardin des Joyeux — Maladrerie garden-city, Aubervilliers (Paris surroundings)
  16: [45.7480, 4.8400],    // Les Berges du Rhone — left bank promenade along Rhone, Lyon (3rd/7th arr.)
  17: [49.2530, 3.9880],    // Les Promenades — Hautes & Basses Promenades, central Reims
  18: [23.1350, 113.3200],  // Liuyun Xiaoqu — south of Tianhe Sports Center, Tianhe district, Guangzhou
  19: [48.8560, 2.4020],    // Passage 56 (Le 56 / Eco-interstice) — 56 Rue Saint-Blaise, 20th arr., Paris
  20: [48.8609, 2.2979],    // Patrick Blanc's Green Wall — Musee du Quai Branly, 37 quai Branly, 7th arr., Paris
  21: [41.3769, 2.1632],    // Placa Sant Antoni (Superilla Sant Antoni) — C/ del Parlament 39, Eixample, Barcelona
  22: [43.6974, 7.2714],    // Promenade du Paillon — Plassa Carlou Aubert, central Nice
  23: [40.4100, -3.7000],   // Proyecto MICOS — school patio greening programme, various districts, Madrid
  24: [48.2170, 16.4110],   // Re-Sourcing Commons — Fritzi-Massary-Park, Offenbachgasse, 2nd district, Vienna
  25: [52.0740, 5.0470],    // Rijnvliet Edible Neighbourhood — Leidsche Rijn expansion area, west Utrecht
  26: [44.8278, -0.5702],   // Rue-jardin Kleber — 99 rue Kleber, near Gare Saint-Jean, Bordeaux
  27: [52.3560, 4.9490],    // SET Community Gardens — Erich Salomonstraat 135, IJburg, Amsterdam
  28: [41.3275, 19.8187],   // Skanderbeg Square — Sheshi Skenderbej, central Tirana
  29: [52.4749, 13.4003],   // Tempelhofer Feld — former Tempelhof Airport, southern Berlin
  30: [51.4842, -0.1089],   // Trees for Trees platform — Trees for Cities, Kennington Park, Lambeth, London
  31: [51.9260, 4.4740],    // Watersquare Benthemplein — Benthemplein, north city center, Rotterdam
  32: [47.5477, 7.5886],    // Winkelriedplatz — Gundeldingen quarter, near Basel SBB station, Basel
  33: [44.4953, 11.3490],   // Temporary Setup Piazza Rossini — Piazza Rossini, near Conservatorio, Bologna
  34: [55.7050, 12.5770],   // Sankt Kjelds Plads & Bryggervangen — Osterbro climate quarter, Copenhagen
  35: [39.7721, 30.5203],   // Hamamyolu Urban Deck — Hamamyolu Caddesi, Odunpazari, Eskisehir
  36: [55.7167, 12.4000],   // Ballerup Boulevard — DK-2740 Skovlunde, Ballerup municipality
  37: [51.9087, 4.4648],    // Little C — G.J. de Jonghweg, Coolhaven, Rotterdam
  38: [45.7372, 4.8364],    // ZAC des Girondins — north of Gerland, 7th arr., Lyon
  39: [47.9942, 7.8497],    // Freiburger Bachle — historic Altstadt runnels, Munsterplatz area, Freiburg
  40: [43.2622, -2.9442],   // Calle Maria Diaz de Haro — green corridor, central Bilbao
  41: [48.0090, 7.8530],    // Zollhallen Plaza — Zollhallenstrasse 1, Guterbahnhof-Nord, Freiburg
  42: [48.1230, 11.5310],   // Brantstrasse — Animal-Aided Design housing, Sendling-Westpark, Munich
  43: [51.0480, 3.7310],    // Kettingplein — neighbourhood square, central Ghent
  44: [9.9168, -84.0397],   // Ciudad Dulce — municipal programme, Curridabat, San Jose metro area
  45: [48.2150, 16.3560],   // Gratzloasen (Neighbourhood Oases) — Burggasse area, 7th district (Neubau), Vienna
  46: [45.0280, 7.6480],    // Orto WOW — Via Onorato Vigliani 102, Mirafiori Sud, Turin
  47: [4.6120, -74.0690],   // Parque Bicentenario — Calle 26 between Cra 5 and Cra 7, Santa Fe, Bogota
  48: [19.4380, -99.1970],  // Linear Park Ferrocarril de Cuernavaca — railway corridor, Polanco / Miguel Hidalgo, Mexico City
  49: [48.8710, 2.3460],    // Ilots de fraicheur (Isles of Coolness) — Oasis schoolyards programme, 18th arr., Paris
  50: [51.5070, -0.0996],   // Bankside Urban Forest — Bankside/Southwark, between Tate Modern and Borough, London
};

export default cityCoordinates;
