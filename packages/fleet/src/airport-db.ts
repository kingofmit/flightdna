/**
 * Airport database for route detection.
 *
 * Contains the top 200 airports worldwide, used to determine
 * origin/destination from aircraft position, altitude, and speed.
 */

export interface Airport {
  /** ICAO code (e.g., "KJFK") */
  icao: string;
  /** IATA code (e.g., "JFK") */
  iata: string;
  /** Airport name */
  name: string;
  /** Latitude in degrees */
  latitude: number;
  /** Longitude in degrees */
  longitude: number;
  /** Elevation in meters MSL */
  elevation: number;
}

const AIRPORTS: Airport[] = [
  // ── Americas ──────────────────────────────────────────────────────────
  { icao: "KJFK", iata: "JFK", name: "John F. Kennedy International Airport", latitude: 40.6413, longitude: -73.7781, elevation: 4 },
  { icao: "KLAX", iata: "LAX", name: "Los Angeles International Airport", latitude: 33.9425, longitude: -118.4081, elevation: 38 },
  { icao: "KORD", iata: "ORD", name: "O'Hare International Airport", latitude: 41.9742, longitude: -87.9073, elevation: 205 },
  { icao: "KATL", iata: "ATL", name: "Hartsfield-Jackson Atlanta International Airport", latitude: 33.6407, longitude: -84.4277, elevation: 313 },
  { icao: "KDFW", iata: "DFW", name: "Dallas/Fort Worth International Airport", latitude: 32.8998, longitude: -97.0403, elevation: 174 },
  { icao: "KDEN", iata: "DEN", name: "Denver International Airport", latitude: 39.8561, longitude: -104.6737, elevation: 1655 },
  { icao: "KSFO", iata: "SFO", name: "San Francisco International Airport", latitude: 37.6213, longitude: -122.3790, elevation: 4 },
  { icao: "KMIA", iata: "MIA", name: "Miami International Airport", latitude: 25.7959, longitude: -80.2870, elevation: 3 },
  { icao: "KEWR", iata: "EWR", name: "Newark Liberty International Airport", latitude: 40.6895, longitude: -74.1745, elevation: 5 },
  { icao: "KBOS", iata: "BOS", name: "Boston Logan International Airport", latitude: 42.3656, longitude: -71.0096, elevation: 6 },
  { icao: "KIAH", iata: "IAH", name: "George Bush Intercontinental Airport", latitude: 29.9844, longitude: -95.3414, elevation: 29 },
  { icao: "KMSP", iata: "MSP", name: "Minneapolis-Saint Paul International Airport", latitude: 44.8820, longitude: -93.2218, elevation: 256 },
  { icao: "KDTW", iata: "DTW", name: "Detroit Metropolitan Wayne County Airport", latitude: 42.2124, longitude: -83.3534, elevation: 195 },
  { icao: "KPHL", iata: "PHL", name: "Philadelphia International Airport", latitude: 39.8721, longitude: -75.2411, elevation: 11 },
  { icao: "KLAS", iata: "LAS", name: "Harry Reid International Airport", latitude: 36.0840, longitude: -115.1537, elevation: 664 },
  { icao: "KSEA", iata: "SEA", name: "Seattle-Tacoma International Airport", latitude: 47.4502, longitude: -122.3088, elevation: 137 },
  { icao: "KMCO", iata: "MCO", name: "Orlando International Airport", latitude: 28.4312, longitude: -81.3081, elevation: 29 },
  { icao: "CYYZ", iata: "YYZ", name: "Toronto Pearson International Airport", latitude: 43.6777, longitude: -79.6248, elevation: 173 },
  { icao: "CYMX", iata: "YUL", name: "Montreal-Trudeau International Airport", latitude: 45.4706, longitude: -73.7408, elevation: 36 },
  { icao: "SBGR", iata: "GRU", name: "Sao Paulo-Guarulhos International Airport", latitude: -23.4356, longitude: -46.4731, elevation: 750 },
  { icao: "MMMX", iata: "MEX", name: "Mexico City International Airport", latitude: 19.4363, longitude: -99.0721, elevation: 2230 },
  { icao: "KLGA", iata: "LGA", name: "LaGuardia Airport", latitude: 40.7769, longitude: -73.8740, elevation: 6 },
  { icao: "KFLL", iata: "FLL", name: "Fort Lauderdale-Hollywood International Airport", latitude: 26.0726, longitude: -80.1527, elevation: 3 },
  { icao: "KBWI", iata: "BWI", name: "Baltimore/Washington International Airport", latitude: 39.1754, longitude: -76.6683, elevation: 46 },
  { icao: "KDCA", iata: "DCA", name: "Ronald Reagan Washington National Airport", latitude: 38.8521, longitude: -77.0377, elevation: 5 },
  { icao: "KIAD", iata: "IAD", name: "Washington Dulles International Airport", latitude: 38.9445, longitude: -77.4558, elevation: 95 },
  { icao: "KSLC", iata: "SLC", name: "Salt Lake City International Airport", latitude: 40.7884, longitude: -111.9778, elevation: 1288 },
  { icao: "KSAN", iata: "SAN", name: "San Diego International Airport", latitude: 32.7336, longitude: -117.1897, elevation: 5 },
  { icao: "KTPA", iata: "TPA", name: "Tampa International Airport", latitude: 27.9755, longitude: -82.5332, elevation: 8 },
  { icao: "KPDX", iata: "PDX", name: "Portland International Airport", latitude: 45.5898, longitude: -122.5951, elevation: 9 },
  { icao: "KSTL", iata: "STL", name: "St. Louis Lambert International Airport", latitude: 38.7487, longitude: -90.3700, elevation: 184 },
  { icao: "KCLT", iata: "CLT", name: "Charlotte Douglas International Airport", latitude: 35.2140, longitude: -80.9431, elevation: 228 },
  { icao: "KPHX", iata: "PHX", name: "Phoenix Sky Harbor International Airport", latitude: 33.4373, longitude: -112.0078, elevation: 346 },
  { icao: "KHNL", iata: "HNL", name: "Daniel K. Inouye International Airport", latitude: 21.3187, longitude: -157.9225, elevation: 4 },
  { icao: "PANC", iata: "ANC", name: "Ted Stevens Anchorage International Airport", latitude: 61.1743, longitude: -149.9962, elevation: 46 },
  { icao: "CYVR", iata: "YVR", name: "Vancouver International Airport", latitude: 49.1947, longitude: -123.1792, elevation: 4 },
  { icao: "CYOW", iata: "YOW", name: "Ottawa Macdonald-Cartier International Airport", latitude: 45.3225, longitude: -75.6692, elevation: 114 },
  { icao: "SCEL", iata: "SCL", name: "Arturo Merino Benitez International Airport", latitude: -33.3930, longitude: -70.7858, elevation: 474 },
  { icao: "SAEZ", iata: "EZE", name: "Ministro Pistarini International Airport", latitude: -34.8222, longitude: -58.5358, elevation: 20 },
  { icao: "SBBR", iata: "BSB", name: "Presidente Juscelino Kubitschek International Airport", latitude: -15.8711, longitude: -47.9186, elevation: 1066 },
  { icao: "SBGL", iata: "GIG", name: "Rio de Janeiro-Galeao International Airport", latitude: -22.8100, longitude: -43.2506, elevation: 9 },
  { icao: "SKBO", iata: "BOG", name: "El Dorado International Airport", latitude: 4.7016, longitude: -74.1469, elevation: 2548 },
  { icao: "SPJC", iata: "LIM", name: "Jorge Chavez International Airport", latitude: -12.0219, longitude: -77.1143, elevation: 34 },
  { icao: "MDPC", iata: "PUJ", name: "Punta Cana International Airport", latitude: 18.5674, longitude: -68.3634, elevation: 14 },
  { icao: "MROC", iata: "SJO", name: "Juan Santamaria International Airport", latitude: 10.0000, longitude: -84.2167, elevation: 920 },
  { icao: "TNCM", iata: "SXM", name: "Princess Juliana International Airport", latitude: 18.0410, longitude: -63.1089, elevation: 4 },
  { icao: "MHTG", iata: "TGU", name: "Toncontin International Airport", latitude: 14.0609, longitude: -87.2172, elevation: 1005 },

  // ── Europe ────────────────────────────────────────────────────────────
  { icao: "EGLL", iata: "LHR", name: "London Heathrow Airport", latitude: 51.4700, longitude: -0.4543, elevation: 25 },
  { icao: "LFPG", iata: "CDG", name: "Paris Charles de Gaulle Airport", latitude: 49.0097, longitude: 2.5479, elevation: 119 },
  { icao: "EDDF", iata: "FRA", name: "Frankfurt Airport", latitude: 50.0379, longitude: 8.5622, elevation: 111 },
  { icao: "EHAM", iata: "AMS", name: "Amsterdam Schiphol Airport", latitude: 52.3086, longitude: 4.7639, elevation: -3 },
  { icao: "LEMD", iata: "MAD", name: "Adolfo Suarez Madrid-Barajas Airport", latitude: 40.4983, longitude: -3.5676, elevation: 609 },
  { icao: "LEBL", iata: "BCN", name: "Barcelona-El Prat Airport", latitude: 41.2971, longitude: 2.0785, elevation: 4 },
  { icao: "LIRF", iata: "FCO", name: "Leonardo da Vinci-Fiumicino Airport", latitude: 41.8003, longitude: 12.2389, elevation: 5 },
  { icao: "EDDM", iata: "MUC", name: "Munich Airport", latitude: 48.3538, longitude: 11.7861, elevation: 453 },
  { icao: "EGKK", iata: "LGW", name: "London Gatwick Airport", latitude: 51.1537, longitude: -0.1821, elevation: 62 },
  { icao: "LSZH", iata: "ZRH", name: "Zurich Airport", latitude: 47.4647, longitude: 8.5492, elevation: 432 },
  { icao: "EKCH", iata: "CPH", name: "Copenhagen Airport", latitude: 55.6180, longitude: 12.6560, elevation: 5 },
  { icao: "ESSA", iata: "ARN", name: "Stockholm Arlanda Airport", latitude: 59.6519, longitude: 17.9186, elevation: 42 },
  { icao: "ENGM", iata: "OSL", name: "Oslo Gardermoen Airport", latitude: 60.1939, longitude: 11.1004, elevation: 208 },
  { icao: "EIDW", iata: "DUB", name: "Dublin Airport", latitude: 53.4213, longitude: -6.2701, elevation: 74 },
  { icao: "LPPT", iata: "LIS", name: "Lisbon Humberto Delgado Airport", latitude: 38.7813, longitude: -9.1359, elevation: 114 },
  { icao: "LOWW", iata: "VIE", name: "Vienna International Airport", latitude: 48.1103, longitude: 16.5697, elevation: 183 },
  { icao: "EPWA", iata: "WAW", name: "Warsaw Chopin Airport", latitude: 52.1657, longitude: 20.9671, elevation: 110 },
  { icao: "LTFM", iata: "IST", name: "Istanbul Airport", latitude: 41.2606, longitude: 28.7419, elevation: 99 },
  { icao: "UUEE", iata: "SVO", name: "Sheremetyevo International Airport", latitude: 55.9726, longitude: 37.4146, elevation: 190 },
  { icao: "EGSS", iata: "STN", name: "London Stansted Airport", latitude: 51.8850, longitude: 0.2350, elevation: 106 },
  { icao: "LFPO", iata: "ORY", name: "Paris Orly Airport", latitude: 48.7233, longitude: 2.3794, elevation: 89 },
  { icao: "EDDB", iata: "BER", name: "Berlin Brandenburg Airport", latitude: 52.3667, longitude: 13.5033, elevation: 48 },
  { icao: "EDDL", iata: "DUS", name: "Dusseldorf Airport", latitude: 51.2895, longitude: 6.7668, elevation: 44 },
  { icao: "LIMC", iata: "MXP", name: "Milan Malpensa Airport", latitude: 45.6306, longitude: 8.7281, elevation: 234 },
  { icao: "LIPE", iata: "BLQ", name: "Bologna Guglielmo Marconi Airport", latitude: 44.5354, longitude: 11.2887, elevation: 37 },
  { icao: "LGAV", iata: "ATH", name: "Athens International Airport", latitude: 37.9364, longitude: 23.9445, elevation: 94 },
  { icao: "LKPR", iata: "PRG", name: "Vaclav Havel Airport Prague", latitude: 50.1008, longitude: 14.2600, elevation: 380 },
  { icao: "LHBP", iata: "BUD", name: "Budapest Ferenc Liszt International Airport", latitude: 47.4369, longitude: 19.2556, elevation: 151 },
  { icao: "EFHK", iata: "HEL", name: "Helsinki-Vantaa Airport", latitude: 60.3172, longitude: 24.9633, elevation: 55 },
  { icao: "LROP", iata: "OTP", name: "Henri Coanda International Airport", latitude: 44.5711, longitude: 26.0850, elevation: 95 },
  { icao: "EGPH", iata: "EDI", name: "Edinburgh Airport", latitude: 55.9500, longitude: -3.3725, elevation: 41 },
  { icao: "EGCC", iata: "MAN", name: "Manchester Airport", latitude: 53.3537, longitude: -2.2750, elevation: 78 },
  { icao: "LFML", iata: "MRS", name: "Marseille Provence Airport", latitude: 43.4367, longitude: 5.2142, elevation: 21 },
  { icao: "LEMG", iata: "AGP", name: "Malaga-Costa del Sol Airport", latitude: 36.6749, longitude: -4.4991, elevation: 16 },
  { icao: "LEAL", iata: "ALC", name: "Alicante-Elche Airport", latitude: 38.2822, longitude: -0.5582, elevation: 43 },

  // ── Middle East / Africa ──────────────────────────────────────────────
  { icao: "OMDB", iata: "DXB", name: "Dubai International Airport", latitude: 25.2528, longitude: 55.3644, elevation: 19 },
  { icao: "OEJN", iata: "JED", name: "King Abdulaziz International Airport", latitude: 21.6796, longitude: 39.1565, elevation: 15 },
  { icao: "OTHH", iata: "DOH", name: "Hamad International Airport", latitude: 25.2731, longitude: 51.6082, elevation: 4 },
  { icao: "OMAA", iata: "AUH", name: "Abu Dhabi International Airport", latitude: 24.4330, longitude: 54.6511, elevation: 27 },
  { icao: "FAOR", iata: "JNB", name: "O.R. Tambo International Airport", latitude: -26.1392, longitude: 28.2460, elevation: 1694 },
  { icao: "HECA", iata: "CAI", name: "Cairo International Airport", latitude: 30.1219, longitude: 31.4056, elevation: 116 },
  { icao: "OERK", iata: "RUH", name: "King Khalid International Airport", latitude: 24.9576, longitude: 46.6988, elevation: 620 },
  { icao: "OBBI", iata: "BAH", name: "Bahrain International Airport", latitude: 26.2708, longitude: 50.6336, elevation: 2 },
  { icao: "OKBK", iata: "KWI", name: "Kuwait International Airport", latitude: 29.2267, longitude: 47.9689, elevation: 63 },
  { icao: "OOMS", iata: "MCT", name: "Muscat International Airport", latitude: 23.5933, longitude: 58.2844, elevation: 14 },
  { icao: "LLBG", iata: "TLV", name: "Ben Gurion Airport", latitude: 32.0114, longitude: 34.8867, elevation: 41 },
  { icao: "HAAB", iata: "ADD", name: "Addis Ababa Bole International Airport", latitude: 8.9779, longitude: 38.7993, elevation: 2334 },
  { icao: "DNMM", iata: "LOS", name: "Murtala Muhammed International Airport", latitude: 6.5774, longitude: 3.3212, elevation: 41 },
  { icao: "HKJK", iata: "NBO", name: "Jomo Kenyatta International Airport", latitude: -1.3192, longitude: 36.9278, elevation: 1624 },
  { icao: "FMEE", iata: "RUN", name: "Roland Garros Airport", latitude: -20.8871, longitude: 55.5103, elevation: 21 },
  { icao: "GMMN", iata: "CMN", name: "Mohammed V International Airport", latitude: 33.3675, longitude: -7.5900, elevation: 199 },
  { icao: "FACT", iata: "CPT", name: "Cape Town International Airport", latitude: -33.9649, longitude: 18.6017, elevation: 46 },
  { icao: "DTTA", iata: "TUN", name: "Tunis-Carthage International Airport", latitude: 36.8510, longitude: 10.2272, elevation: 6 },

  // ── Asia-Pacific ──────────────────────────────────────────────────────
  { icao: "RJTT", iata: "HND", name: "Tokyo Haneda Airport", latitude: 35.5494, longitude: 139.7798, elevation: 11 },
  { icao: "RJAA", iata: "NRT", name: "Narita International Airport", latitude: 35.7647, longitude: 140.3864, elevation: 41 },
  { icao: "VHHH", iata: "HKG", name: "Hong Kong International Airport", latitude: 22.3080, longitude: 113.9185, elevation: 9 },
  { icao: "WSSS", iata: "SIN", name: "Singapore Changi Airport", latitude: 1.3502, longitude: 103.9940, elevation: 7 },
  { icao: "RKSI", iata: "ICN", name: "Incheon International Airport", latitude: 37.4602, longitude: 126.4407, elevation: 7 },
  { icao: "VTBS", iata: "BKK", name: "Suvarnabhumi Airport", latitude: 13.6900, longitude: 100.7501, elevation: 2 },
  { icao: "ZBAA", iata: "PEK", name: "Beijing Capital International Airport", latitude: 40.0799, longitude: 116.6031, elevation: 35 },
  { icao: "ZSPD", iata: "PVG", name: "Shanghai Pudong International Airport", latitude: 31.1443, longitude: 121.8083, elevation: 4 },
  { icao: "ZGGG", iata: "CAN", name: "Guangzhou Baiyun International Airport", latitude: 23.3924, longitude: 113.2988, elevation: 11 },
  { icao: "VIDP", iata: "DEL", name: "Indira Gandhi International Airport", latitude: 28.5665, longitude: 77.1031, elevation: 237 },
  { icao: "VABB", iata: "BOM", name: "Chhatrapati Shivaji Maharaj International Airport", latitude: 19.0896, longitude: 72.8656, elevation: 11 },
  { icao: "WMKK", iata: "KUL", name: "Kuala Lumpur International Airport", latitude: 2.7456, longitude: 101.7099, elevation: 21 },
  { icao: "RPLL", iata: "MNL", name: "Ninoy Aquino International Airport", latitude: 14.5086, longitude: 121.0198, elevation: 23 },
  { icao: "YSSY", iata: "SYD", name: "Sydney Kingsford Smith Airport", latitude: -33.9461, longitude: 151.1772, elevation: 6 },
  { icao: "YMML", iata: "MEL", name: "Melbourne Airport", latitude: -37.6733, longitude: 144.8431, elevation: 132 },
  { icao: "NZAA", iata: "AKL", name: "Auckland Airport", latitude: -37.0082, longitude: 174.7850, elevation: 7 },
  { icao: "ZSSS", iata: "SHA", name: "Shanghai Hongqiao International Airport", latitude: 31.1979, longitude: 121.3363, elevation: 3 },
  { icao: "ZUUU", iata: "CTU", name: "Chengdu Shuangliu International Airport", latitude: 30.5785, longitude: 103.9471, elevation: 495 },
  { icao: "ZGSZ", iata: "SZX", name: "Shenzhen Bao'an International Airport", latitude: 22.6393, longitude: 113.8107, elevation: 4 },
  { icao: "ZLXY", iata: "XIY", name: "Xi'an Xianyang International Airport", latitude: 34.4471, longitude: 108.7516, elevation: 479 },
  { icao: "ZKPY", iata: "FNJ", name: "Pyongyang Sunan International Airport", latitude: 39.2241, longitude: 125.6700, elevation: 36 },
  { icao: "RKSS", iata: "GMP", name: "Gimpo International Airport", latitude: 37.5586, longitude: 126.7906, elevation: 17 },
  { icao: "RJBB", iata: "KIX", name: "Kansai International Airport", latitude: 34.4320, longitude: 135.2440, elevation: 8 },
  { icao: "RJCC", iata: "CTS", name: "New Chitose Airport", latitude: 42.7752, longitude: 141.6922, elevation: 25 },
  { icao: "RJGG", iata: "NGO", name: "Chubu Centrair International Airport", latitude: 34.8584, longitude: 136.8125, elevation: 5 },
  { icao: "WIII", iata: "CGK", name: "Soekarno-Hatta International Airport", latitude: -6.1256, longitude: 106.6558, elevation: 10 },
  { icao: "WADD", iata: "DPS", name: "Ngurah Rai International Airport", latitude: -8.7482, longitude: 115.1672, elevation: 3 },
  { icao: "VTBD", iata: "DMK", name: "Don Mueang International Airport", latitude: 13.9126, longitude: 100.6068, elevation: 3 },
  { icao: "VTSB", iata: "HKT", name: "Phuket International Airport", latitude: 8.1132, longitude: 98.3169, elevation: 25 },
  { icao: "VVNB", iata: "HAN", name: "Noi Bai International Airport", latitude: 21.2212, longitude: 105.8070, elevation: 12 },
  { icao: "VVTS", iata: "SGN", name: "Tan Son Nhat International Airport", latitude: 10.8188, longitude: 106.6519, elevation: 10 },
  { icao: "VOBL", iata: "BLR", name: "Kempegowda International Airport", latitude: 13.1979, longitude: 77.7063, elevation: 915 },
  { icao: "VOHS", iata: "HYD", name: "Rajiv Gandhi International Airport", latitude: 17.2403, longitude: 78.4294, elevation: 617 },
  { icao: "VOMM", iata: "MAA", name: "Chennai International Airport", latitude: 12.9941, longitude: 80.1709, elevation: 16 },
  { icao: "VECC", iata: "CCU", name: "Netaji Subhas Chandra Bose International Airport", latitude: 22.6547, longitude: 88.4467, elevation: 5 },
  { icao: "OPKC", iata: "KHI", name: "Jinnah International Airport", latitude: 24.9065, longitude: 67.1609, elevation: 30 },
  { icao: "OPLA", iata: "LHE", name: "Allama Iqbal International Airport", latitude: 31.5216, longitude: 74.4036, elevation: 217 },
  { icao: "VRMM", iata: "MLE", name: "Velana International Airport", latitude: 4.1918, longitude: 73.5290, elevation: 2 },
  { icao: "VCBI", iata: "CMB", name: "Bandaranaike International Airport", latitude: 7.1808, longitude: 79.8841, elevation: 9 },
  { icao: "YBBN", iata: "BNE", name: "Brisbane Airport", latitude: -27.3842, longitude: 153.1175, elevation: 4 },
  { icao: "YPPH", iata: "PER", name: "Perth Airport", latitude: -31.9403, longitude: 115.9672, elevation: 20 },
  { icao: "NZWN", iata: "WLG", name: "Wellington Airport", latitude: -41.3272, longitude: 174.8053, elevation: 12 },
  { icao: "NZCH", iata: "CHC", name: "Christchurch Airport", latitude: -43.4894, longitude: 172.5322, elevation: 37 },

  // ── Additional Americas ───────────────────────────────────────────────
  { icao: "KMEM", iata: "MEM", name: "Memphis International Airport", latitude: 35.0424, longitude: -89.9767, elevation: 104 },
  { icao: "KCVG", iata: "CVG", name: "Cincinnati/Northern Kentucky International Airport", latitude: 39.0488, longitude: -84.6678, elevation: 271 },
  { icao: "KIND", iata: "IND", name: "Indianapolis International Airport", latitude: 39.7173, longitude: -86.2944, elevation: 241 },
  { icao: "KPIT", iata: "PIT", name: "Pittsburgh International Airport", latitude: 40.4915, longitude: -80.2329, elevation: 367 },
  { icao: "KRDU", iata: "RDU", name: "Raleigh-Durham International Airport", latitude: 35.8776, longitude: -78.7875, elevation: 126 },
  { icao: "KAUS", iata: "AUS", name: "Austin-Bergstrom International Airport", latitude: 30.1975, longitude: -97.6664, elevation: 165 },
  { icao: "KBNA", iata: "BNA", name: "Nashville International Airport", latitude: 36.1245, longitude: -86.6782, elevation: 183 },
  { icao: "KMKE", iata: "MKE", name: "Milwaukee Mitchell International Airport", latitude: 42.9472, longitude: -87.8966, elevation: 220 },
  { icao: "KMSY", iata: "MSY", name: "Louis Armstrong New Orleans International Airport", latitude: 29.9934, longitude: -90.2580, elevation: 1 },
  { icao: "KCLE", iata: "CLE", name: "Cleveland Hopkins International Airport", latitude: 41.4117, longitude: -81.8498, elevation: 241 },
  { icao: "KSJC", iata: "SJC", name: "San Jose International Airport", latitude: 37.3626, longitude: -121.9291, elevation: 19 },
  { icao: "KOAK", iata: "OAK", name: "Oakland International Airport", latitude: 37.7213, longitude: -122.2208, elevation: 2 },
  { icao: "MMUN", iata: "CUN", name: "Cancun International Airport", latitude: 21.0365, longitude: -86.8771, elevation: 10 },
  { icao: "MGGT", iata: "GUA", name: "La Aurora International Airport", latitude: 14.5833, longitude: -90.5275, elevation: 1509 },
  { icao: "MPPA", iata: "PTY", name: "Tocumen International Airport", latitude: 9.0714, longitude: -79.3835, elevation: 41 },
  { icao: "SVMI", iata: "CCS", name: "Simon Bolivar International Airport", latitude: 10.6012, longitude: -66.9912, elevation: 72 },
  { icao: "SEQM", iata: "UIO", name: "Mariscal Sucre International Airport", latitude: -0.1292, longitude: -78.3575, elevation: 2400 },

  // ── Additional Europe ─────────────────────────────────────────────────
  { icao: "EDDH", iata: "HAM", name: "Hamburg Airport", latitude: 53.6304, longitude: 9.9882, elevation: 16 },
  { icao: "EDDS", iata: "STR", name: "Stuttgart Airport", latitude: 48.6900, longitude: 9.2219, elevation: 389 },
  { icao: "EDDK", iata: "CGN", name: "Cologne Bonn Airport", latitude: 50.8659, longitude: 7.1427, elevation: 92 },
  { icao: "LFMN", iata: "NCE", name: "Nice Cote d'Azur Airport", latitude: 43.6584, longitude: 7.2159, elevation: 4 },
  { icao: "LFLL", iata: "LYS", name: "Lyon-Saint Exupery Airport", latitude: 45.7256, longitude: 5.0811, elevation: 250 },
  { icao: "LIRN", iata: "NAP", name: "Naples International Airport", latitude: 40.8860, longitude: 14.2908, elevation: 90 },
  { icao: "LIPZ", iata: "VCE", name: "Venice Marco Polo Airport", latitude: 45.5053, longitude: 12.3519, elevation: 2 },
  { icao: "GCXO", iata: "TFS", name: "Tenerife South Airport", latitude: 28.0445, longitude: -16.5725, elevation: 64 },
  { icao: "LEPA", iata: "PMI", name: "Palma de Mallorca Airport", latitude: 39.5517, longitude: 2.7388, elevation: 8 },
  { icao: "LTAI", iata: "AYT", name: "Antalya Airport", latitude: 36.8987, longitude: 30.8005, elevation: 54 },
  { icao: "LTBA", iata: "SAW", name: "Istanbul Sabiha Gokcen Airport", latitude: 40.8986, longitude: 29.3092, elevation: 95 },
  { icao: "UUDD", iata: "DME", name: "Moscow Domodedovo Airport", latitude: 55.4088, longitude: 37.9063, elevation: 180 },
  { icao: "ULLI", iata: "LED", name: "Pulkovo Airport", latitude: 59.8003, longitude: 30.2625, elevation: 24 },

  // ── Additional Asia-Pacific ───────────────────────────────────────────
  { icao: "ZUCK", iata: "CKG", name: "Chongqing Jiangbei International Airport", latitude: 29.7193, longitude: 106.6417, elevation: 416 },
  { icao: "ZWWW", iata: "URC", name: "Urumqi Diwopu International Airport", latitude: 43.9071, longitude: 87.4742, elevation: 647 },
  { icao: "ZHCC", iata: "CGO", name: "Zhengzhou Xinzheng International Airport", latitude: 34.5197, longitude: 113.8407, elevation: 151 },
  { icao: "ZSJN", iata: "TNA", name: "Jinan Yaoqiang International Airport", latitude: 36.8572, longitude: 117.2158, elevation: 23 },
  { icao: "RCTP", iata: "TPE", name: "Taiwan Taoyuan International Airport", latitude: 25.0777, longitude: 121.2325, elevation: 33 },
  { icao: "RPVM", iata: "CEB", name: "Mactan-Cebu International Airport", latitude: 10.3074, longitude: 123.9794, elevation: 9 },

  // ── Additional to reach 200 ───────────────────────────────────────────
  { icao: "KJAX", iata: "JAX", name: "Jacksonville International Airport", latitude: 30.4941, longitude: -81.6879, elevation: 9 },
  { icao: "KSMF", iata: "SMF", name: "Sacramento International Airport", latitude: 38.6954, longitude: -121.5908, elevation: 8 },
  { icao: "KONT", iata: "ONT", name: "Ontario International Airport", latitude: 34.0560, longitude: -117.6012, elevation: 290 },
  { icao: "KABQ", iata: "ABQ", name: "Albuquerque International Sunport", latitude: 35.0402, longitude: -106.6092, elevation: 1631 },
  { icao: "KOMA", iata: "OMA", name: "Eppley Airfield", latitude: 41.3032, longitude: -95.8941, elevation: 299 },
  { icao: "KBUF", iata: "BUF", name: "Buffalo Niagara International Airport", latitude: 42.9405, longitude: -78.7322, elevation: 222 },
  { icao: "CYWG", iata: "YWG", name: "Winnipeg James Armstrong Richardson International Airport", latitude: 49.9100, longitude: -97.2399, elevation: 239 },
  { icao: "CYEG", iata: "YEG", name: "Edmonton International Airport", latitude: 53.3097, longitude: -113.5800, elevation: 723 },
  { icao: "CYYC", iata: "YYC", name: "Calgary International Airport", latitude: 51.1215, longitude: -114.0076, elevation: 1084 },
  { icao: "SBKP", iata: "VCP", name: "Viracopos International Airport", latitude: -23.0074, longitude: -47.1345, elevation: 661 },
  { icao: "LEBB", iata: "BIO", name: "Bilbao Airport", latitude: 43.3011, longitude: -2.9106, elevation: 42 },
  { icao: "LFBD", iata: "BOD", name: "Bordeaux-Merignac Airport", latitude: 44.8283, longitude: -0.7156, elevation: 49 },
  { icao: "LIMF", iata: "TRN", name: "Turin Airport", latitude: 45.2008, longitude: 7.6496, elevation: 301 },
  { icao: "BIKF", iata: "KEF", name: "Keflavik International Airport", latitude: 63.9850, longitude: -22.6056, elevation: 52 },
  { icao: "LFJL", iata: "ETZ", name: "Metz-Nancy-Lorraine Airport", latitude: 48.9822, longitude: 6.2513, elevation: 265 },
  { icao: "OMDW", iata: "DWC", name: "Al Maktoum International Airport", latitude: 24.8966, longitude: 55.1614, elevation: 34 },
  { icao: "ZJHK", iata: "HAK", name: "Haikou Meilan International Airport", latitude: 19.9349, longitude: 110.4590, elevation: 23 },
  { icao: "ZLLL", iata: "LHW", name: "Lanzhou Zhongchuan International Airport", latitude: 36.5152, longitude: 103.6203, elevation: 1947 },
  { icao: "ZSNJ", iata: "NKG", name: "Nanjing Lukou International Airport", latitude: 31.7420, longitude: 118.8620, elevation: 15 },
  { icao: "VOGO", iata: "GOI", name: "Goa International Airport", latitude: 15.3808, longitude: 73.8314, elevation: 56 },
  { icao: "YBCS", iata: "CNS", name: "Cairns Airport", latitude: -16.8858, longitude: 145.7553, elevation: 3 },
];

/** Map ICAO code to airport for O(1) lookup */
const byIcao = new Map<string, Airport>();
for (const airport of AIRPORTS) {
  byIcao.set(airport.icao, airport);
}

/** Map IATA code to airport for O(1) lookup */
const byIata = new Map<string, Airport>();
for (const airport of AIRPORTS) {
  byIata.set(airport.iata, airport);
}

/**
 * Find an airport by its ICAO code.
 */
export function findAirport(icao: string): Airport | undefined {
  return byIcao.get(icao.toUpperCase());
}

/**
 * Haversine distance between two geographic coordinates in kilometers.
 */
function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  return R * c;
}

/**
 * Find the nearest airport to a given lat/lon coordinate.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param maxDistanceKm - Maximum search radius in km (default: 15)
 * @returns The nearest airport within range, or undefined if none found
 */
export function findNearestAirport(
  lat: number,
  lon: number,
  maxDistanceKm: number = 15,
): Airport | undefined {
  let best: Airport | undefined;
  let bestDist = Infinity;

  for (const airport of AIRPORTS) {
    const dist = haversineDistanceKm(lat, lon, airport.latitude, airport.longitude);
    if (dist < bestDist && dist <= maxDistanceKm) {
      bestDist = dist;
      best = airport;
    }
  }

  return best;
}

/**
 * Get the full list of airports in the database.
 */
export function getAllAirports(): Airport[] {
  return [...AIRPORTS];
}
