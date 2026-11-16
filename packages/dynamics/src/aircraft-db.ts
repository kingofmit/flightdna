/**
 * Aircraft type database for FlightDNA dynamics package.
 *
 * Contains performance parameters for 50 common aircraft types, sourced from
 * publicly available manufacturer specifications, Wikipedia, and OpenAP.
 * Aerodynamic estimates (cd0, k) are reasonable approximations for use in
 * point-mass trajectory modeling.
 */

import type { AircraftConfig } from "./types";

export interface AircraftTypeData {
  /** ICAO type designator (e.g., "B738") */
  typeDesignator: string;
  /** Common name */
  name: string;
  /** Wing reference area in m² */
  wingArea: number;
  /** Wing span in meters */
  wingSpan: number;
  /** Maximum takeoff weight in kg */
  mtow: number;
  /** Operating empty weight in kg */
  oew: number;
  /** Number of engines */
  engineCount: number;
  /** Engine type */
  engineType: "turbofan" | "turboprop" | "piston";
  /** Typical cruise Mach */
  typicalCruiseMach: number;
  /** Typical cruise altitude in meters */
  typicalCruiseAltitude: number;
  /** Estimated zero-lift drag coefficient */
  cd0Estimate: number;
  /** Estimated induced drag factor k = 1/(π·e·AR) */
  kEstimate: number;
  /** Maximum thrust at sea level in Newtons (total, all engines) */
  maxThrustSL: number;
  /** Aircraft category */
  category:
    | "narrowbody"
    | "widebody"
    | "regional"
    | "turboprop"
    | "business_jet"
    | "general_aviation";
}

/**
 * Internal database stored as a Map for O(1) lookup by ICAO type designator.
 */
const AIRCRAFT_DATABASE: Map<string, AircraftTypeData> = new Map();

// ---------------------------------------------------------------------------
// Helper to register aircraft entries
// ---------------------------------------------------------------------------
function reg(data: AircraftTypeData): void {
  AIRCRAFT_DATABASE.set(data.typeDesignator.toUpperCase(), data);
}

// ========================== NARROWBODY JETS ================================

// 1. Boeing 737-800
reg({
  typeDesignator: "B738",
  name: "Boeing 737-800",
  wingArea: 124.6,
  wingSpan: 35.8,
  mtow: 79016,
  oew: 41413,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.785,
  typicalCruiseAltitude: 11278, // FL370
  cd0Estimate: 0.024,
  kEstimate: 0.042,
  maxThrustSL: 242800, // 2 × CFM56-7B26 @ 121.4 kN
  category: "narrowbody",
});

// 2. Boeing 737-700
reg({
  typeDesignator: "B73G",
  name: "Boeing 737-700",
  wingArea: 124.6,
  wingSpan: 35.8,
  mtow: 70080,
  oew: 38147,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.785,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.024,
  kEstimate: 0.042,
  maxThrustSL: 222400, // 2 × CFM56-7B22 @ 111.2 kN
  category: "narrowbody",
});

// 3. Boeing 737-900ER
reg({
  typeDesignator: "B739",
  name: "Boeing 737-900ER",
  wingArea: 124.6,
  wingSpan: 35.8,
  mtow: 85139,
  oew: 44676,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.785,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.024,
  kEstimate: 0.042,
  maxThrustSL: 242800, // 2 × CFM56-7B26
  category: "narrowbody",
});

// 4. Boeing 737 MAX 8
reg({
  typeDesignator: "B38M",
  name: "Boeing 737 MAX 8",
  wingArea: 127.0,
  wingSpan: 35.9,
  mtow: 82191,
  oew: 45070,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.79,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.023,
  kEstimate: 0.042, // AR=10.15, e~0.83 → k≈0.038; slightly higher for compressibility
  maxThrustSL: 254200, // 2 × LEAP-1B28 @ 127.1 kN
  category: "narrowbody",
});

// 5. Airbus A320-200
reg({
  typeDesignator: "A320",
  name: "Airbus A320-200",
  wingArea: 122.6,
  wingSpan: 35.8,
  mtow: 78000,
  oew: 42600,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.024,
  kEstimate: 0.040,
  maxThrustSL: 240200, // 2 × CFM56-5B4 @ 120.1 kN
  category: "narrowbody",
});

// 6. Airbus A319
reg({
  typeDesignator: "A319",
  name: "Airbus A319",
  wingArea: 122.6,
  wingSpan: 35.8,
  mtow: 75500,
  oew: 40800,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.024,
  kEstimate: 0.040,
  maxThrustSL: 222400, // 2 × CFM56-5B5 @ 111.2 kN
  category: "narrowbody",
});

// 7. Airbus A321-200
reg({
  typeDesignator: "A321",
  name: "Airbus A321-200",
  wingArea: 122.6,
  wingSpan: 35.8,
  mtow: 93500,
  oew: 48500,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.024,
  kEstimate: 0.040,
  maxThrustSL: 267000, // 2 × V2533-A5 @ 133.5 kN
  category: "narrowbody",
});

// 8. Airbus A321neo
reg({
  typeDesignator: "A21N",
  name: "Airbus A321neo",
  wingArea: 122.6,
  wingSpan: 35.8,
  mtow: 97000,
  oew: 50100,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11887, // FL390
  cd0Estimate: 0.023,
  kEstimate: 0.040,
  maxThrustSL: 275800, // 2 × PW1133G @ 137.9 kN
  category: "narrowbody",
});

// 9. Airbus A220-300
reg({
  typeDesignator: "BCS3",
  name: "Airbus A220-300",
  wingArea: 112.3,
  wingSpan: 35.1,
  mtow: 67585,
  oew: 37080,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.023,
  kEstimate: 0.039, // AR=10.97, e~0.83
  maxThrustSL: 210400, // 2 × PW1524G @ 105.2 kN
  category: "narrowbody",
});

// 10. Boeing 757-200
reg({
  typeDesignator: "B752",
  name: "Boeing 757-200",
  wingArea: 185.3,
  wingSpan: 38.1,
  mtow: 115680,
  oew: 57840,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.80,
  typicalCruiseAltitude: 11887, // FL390
  cd0Estimate: 0.024,
  kEstimate: 0.053, // AR=7.83, e~0.82
  maxThrustSL: 356000, // 2 × RB211-535E4 @ 178 kN
  category: "narrowbody",
});

// 11. Boeing 757-300
reg({
  typeDesignator: "B753",
  name: "Boeing 757-300",
  wingArea: 185.3,
  wingSpan: 38.1,
  mtow: 123600,
  oew: 63100,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.80,
  typicalCruiseAltitude: 11887,
  cd0Estimate: 0.024,
  kEstimate: 0.053,
  maxThrustSL: 378100, // 2 × RB211-535E4B @ 189.05 kN
  category: "narrowbody",
});

// 12. Embraer E190
reg({
  typeDesignator: "E190",
  name: "Embraer E190",
  wingArea: 92.5,
  wingSpan: 28.7,
  mtow: 51800,
  oew: 28080,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 10668, // FL350
  cd0Estimate: 0.025,
  kEstimate: 0.046, // AR=8.90, e~0.82
  maxThrustSL: 178400, // 2 × CF34-10E @ 89.2 kN
  category: "regional",
});

// 13. Embraer E195
reg({
  typeDesignator: "E195",
  name: "Embraer E195",
  wingArea: 92.5,
  wingSpan: 28.7,
  mtow: 52290,
  oew: 28970,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.025,
  kEstimate: 0.046,
  maxThrustSL: 178400, // 2 × CF34-10E
  category: "regional",
});

// 14. Bombardier CRJ-900
reg({
  typeDesignator: "CRJ9",
  name: "Bombardier CRJ-900",
  wingArea: 70.6,
  wingSpan: 24.9,
  mtow: 36514,
  oew: 21523,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.025,
  kEstimate: 0.049, // AR=8.78, e~0.80
  maxThrustSL: 126760, // 2 × CF34-8C5 @ 63.38 kN
  category: "regional",
});

// ========================== WIDEBODY JETS ==================================

// 15. Boeing 777-300ER
reg({
  typeDesignator: "B77W",
  name: "Boeing 777-300ER",
  wingArea: 427.8,
  wingSpan: 64.8,
  mtow: 351534,
  oew: 167829,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.84,
  typicalCruiseAltitude: 10668, // FL350
  cd0Estimate: 0.022,
  kEstimate: 0.038,
  maxThrustSL: 1026800, // 2 × GE90-115B @ 513.4 kN
  category: "widebody",
});

// 16. Boeing 777-200ER
reg({
  typeDesignator: "B772",
  name: "Boeing 777-200ER",
  wingArea: 427.8,
  wingSpan: 60.9,
  mtow: 297556,
  oew: 138100,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.84,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.022,
  kEstimate: 0.040, // AR=8.67, e~0.82
  maxThrustSL: 836800, // 2 × GE90-94B @ 418.4 kN
  category: "widebody",
});

// 17. Boeing 787-8
reg({
  typeDesignator: "B788",
  name: "Boeing 787-8 Dreamliner",
  wingArea: 377.0,
  wingSpan: 60.1,
  mtow: 227930,
  oew: 119950,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 12192, // FL400
  cd0Estimate: 0.021,
  kEstimate: 0.039, // AR=9.58, e~0.85
  maxThrustSL: 560900, // 2 × Trent 1000 @ 280.45 kN
  category: "widebody",
});

// 18. Boeing 787-9
reg({
  typeDesignator: "B789",
  name: "Boeing 787-9 Dreamliner",
  wingArea: 377.0,
  wingSpan: 60.1,
  mtow: 252651,
  oew: 128850,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 12192,
  cd0Estimate: 0.021,
  kEstimate: 0.039,
  maxThrustSL: 617400, // 2 × GEnx-1B @ 308.7 kN
  category: "widebody",
});

// 19. Boeing 787-10
reg({
  typeDesignator: "B78X",
  name: "Boeing 787-10 Dreamliner",
  wingArea: 377.0,
  wingSpan: 60.1,
  mtow: 254011,
  oew: 135500,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 12192,
  cd0Estimate: 0.021,
  kEstimate: 0.039,
  maxThrustSL: 617400, // 2 × GEnx-1B
  category: "widebody",
});

// 20. Boeing 747-400
reg({
  typeDesignator: "B744",
  name: "Boeing 747-400",
  wingArea: 541.2,
  wingSpan: 64.4,
  mtow: 412775,
  oew: 178756,
  engineCount: 4,
  engineType: "turbofan",
  typicalCruiseMach: 0.855,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.022,
  kEstimate: 0.042, // AR=7.66, e~0.80
  maxThrustSL: 1016000, // 4 × CF6-80C2B1F @ 254 kN
  category: "widebody",
});

// 21. Boeing 747-8
reg({
  typeDesignator: "B748",
  name: "Boeing 747-8",
  wingArea: 554.0,
  wingSpan: 68.4,
  mtow: 447696,
  oew: 220128,
  engineCount: 4,
  engineType: "turbofan",
  typicalCruiseMach: 0.855,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.022,
  kEstimate: 0.039, // AR=8.45, e~0.82
  maxThrustSL: 1188000, // 4 × GEnx-2B67 @ 297 kN
  category: "widebody",
});

// 22. Airbus A330-300
reg({
  typeDesignator: "A333",
  name: "Airbus A330-300",
  wingArea: 361.6,
  wingSpan: 60.3,
  mtow: 242000,
  oew: 124500,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.82,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.023,
  kEstimate: 0.039, // AR=10.05, e~0.82
  maxThrustSL: 604600, // 2 × Trent 772B @ 302.3 kN
  category: "widebody",
});

// 23. Airbus A330-200
reg({
  typeDesignator: "A332",
  name: "Airbus A330-200",
  wingArea: 361.6,
  wingSpan: 60.3,
  mtow: 242000,
  oew: 120600,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.82,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.023,
  kEstimate: 0.039,
  maxThrustSL: 604600, // 2 × Trent 772B
  category: "widebody",
});

// 24. Airbus A340-300
reg({
  typeDesignator: "A343",
  name: "Airbus A340-300",
  wingArea: 361.6,
  wingSpan: 60.3,
  mtow: 276500,
  oew: 129300,
  engineCount: 4,
  engineType: "turbofan",
  typicalCruiseMach: 0.82,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.023,
  kEstimate: 0.039,
  maxThrustSL: 604800, // 4 × CFM56-5C4 @ 151.2 kN
  category: "widebody",
});

// 25. Airbus A350-900
reg({
  typeDesignator: "A359",
  name: "Airbus A350-900",
  wingArea: 443.0,
  wingSpan: 64.8,
  mtow: 280000,
  oew: 142400,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 12192,
  cd0Estimate: 0.021,
  kEstimate: 0.036,
  maxThrustSL: 672000, // 2 × Trent XWB-84 @ 336 kN
  category: "widebody",
});

// 26. Airbus A350-1000
reg({
  typeDesignator: "A35K",
  name: "Airbus A350-1000",
  wingArea: 443.0,
  wingSpan: 64.8,
  mtow: 316000,
  oew: 155000,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 12192,
  cd0Estimate: 0.021,
  kEstimate: 0.036,
  maxThrustSL: 780000, // 2 × Trent XWB-97 @ 390 kN
  category: "widebody",
});

// 27. Airbus A380-800
reg({
  typeDesignator: "A388",
  name: "Airbus A380-800",
  wingArea: 845.0,
  wingSpan: 79.8,
  mtow: 575000,
  oew: 276800,
  engineCount: 4,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 12192,
  cd0Estimate: 0.023,
  kEstimate: 0.037,
  maxThrustSL: 1248000, // 4 × Trent 970 @ 312 kN
  category: "widebody",
});

// 28. Boeing 767-300ER
reg({
  typeDesignator: "B763",
  name: "Boeing 767-300ER",
  wingArea: 283.3,
  wingSpan: 47.6,
  mtow: 186880,
  oew: 90010,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.80,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.023,
  kEstimate: 0.043, // AR=8.00, e~0.82
  maxThrustSL: 507000, // 2 × CF6-80C2B7F @ 253.5 kN
  category: "widebody",
});

// 29. Airbus A300-600
reg({
  typeDesignator: "A306",
  name: "Airbus A300-600",
  wingArea: 260.0,
  wingSpan: 44.8,
  mtow: 170500,
  oew: 90100,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.024,
  kEstimate: 0.044, // AR=7.72, e~0.82
  maxThrustSL: 498200, // 2 × CF6-80C2A5 @ 249.1 kN
  category: "widebody",
});

// ========================== REGIONAL / TURBOPROP ===========================

// 30. ATR 72-600
reg({
  typeDesignator: "AT76",
  name: "ATR 72-600",
  wingArea: 61.0,
  wingSpan: 27.1,
  mtow: 23000,
  oew: 13500,
  engineCount: 2,
  engineType: "turboprop",
  typicalCruiseMach: 0.41,
  typicalCruiseAltitude: 7620, // FL250
  cd0Estimate: 0.027,
  kEstimate: 0.044, // AR=12.04, e~0.80
  maxThrustSL: 50000, // 2 × PW127M (approx static equivalent)
  category: "turboprop",
});

// 31. ATR 42-600
reg({
  typeDesignator: "AT46",
  name: "ATR 42-600",
  wingArea: 54.5,
  wingSpan: 24.6,
  mtow: 18600,
  oew: 11550,
  engineCount: 2,
  engineType: "turboprop",
  typicalCruiseMach: 0.40,
  typicalCruiseAltitude: 7620,
  cd0Estimate: 0.027,
  kEstimate: 0.044, // AR=11.10, e~0.80
  maxThrustSL: 40000, // 2 × PW127M (derated)
  category: "turboprop",
});

// 32. De Havilland DHC-8-400 (Dash 8 Q400)
reg({
  typeDesignator: "DH8D",
  name: "De Havilland DHC-8-400",
  wingArea: 63.1,
  wingSpan: 28.4,
  mtow: 29257,
  oew: 17819,
  engineCount: 2,
  engineType: "turboprop",
  typicalCruiseMach: 0.43,
  typicalCruiseAltitude: 7620,
  cd0Estimate: 0.027,
  kEstimate: 0.041, // AR=12.78, e~0.80
  maxThrustSL: 62000, // 2 × PW150A (approx static equivalent)
  category: "turboprop",
});

// 33. Embraer ERJ-145
reg({
  typeDesignator: "E145",
  name: "Embraer ERJ-145",
  wingArea: 51.2,
  wingSpan: 20.0,
  mtow: 22000,
  oew: 12114,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.026,
  kEstimate: 0.055, // AR=7.81, e~0.80
  maxThrustSL: 72900, // 2 × AE3007 @ 36.45 kN
  category: "regional",
});

// ========================== BUSINESS JETS ===================================

// 34. Gulfstream G650
reg({
  typeDesignator: "GL6T",
  name: "Gulfstream G650",
  wingArea: 105.6,
  wingSpan: 30.4,
  mtow: 45178,
  oew: 24766,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 13716, // FL450
  cd0Estimate: 0.022,
  kEstimate: 0.047, // AR=8.75, e~0.82
  maxThrustSL: 135600, // 2 × BR725 @ 67.8 kN
  category: "business_jet",
});

// 35. Bombardier Global 7500
reg({
  typeDesignator: "GL7T",
  name: "Bombardier Global 7500",
  wingArea: 105.0,
  wingSpan: 31.7,
  mtow: 48806,
  oew: 27023,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.85,
  typicalCruiseAltitude: 13716,
  cd0Estimate: 0.022,
  kEstimate: 0.044, // AR=9.57, e~0.82
  maxThrustSL: 140600, // 2 × GE Passport @ 70.3 kN
  category: "business_jet",
});

// 36. Cessna Citation X
reg({
  typeDesignator: "C750",
  name: "Cessna Citation X",
  wingArea: 49.0,
  wingSpan: 19.5,
  mtow: 16375,
  oew: 9799,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.87,
  typicalCruiseAltitude: 13716,
  cd0Estimate: 0.022,
  kEstimate: 0.053, // AR=7.76, e~0.82
  maxThrustSL: 60800, // 2 × AE3007C1 @ 30.4 kN
  category: "business_jet",
});

// 37. Embraer Phenom 300
reg({
  typeDesignator: "E55P",
  name: "Embraer Phenom 300",
  wingArea: 24.4,
  wingSpan: 16.2,
  mtow: 8150,
  oew: 5240,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 13716,
  cd0Estimate: 0.023,
  kEstimate: 0.039, // AR=10.76, e~0.82
  maxThrustSL: 33360, // 2 × PW535E1 @ 16.68 kN
  category: "business_jet",
});

// 38. Learjet 75
reg({
  typeDesignator: "LJ75",
  name: "Learjet 75",
  wingArea: 24.6,
  wingSpan: 15.9,
  mtow: 9752,
  oew: 6350,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.79,
  typicalCruiseAltitude: 13716,
  cd0Estimate: 0.023,
  kEstimate: 0.041, // AR=10.28, e~0.82
  maxThrustSL: 40920, // 2 × TFE731-40BR @ 20.46 kN
  category: "business_jet",
});

// ========================== CARGO ==========================================

// 39. Boeing 777F
reg({
  typeDesignator: "B77L",
  name: "Boeing 777F",
  wingArea: 427.8,
  wingSpan: 64.8,
  mtow: 347452,
  oew: 144400,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.84,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.022,
  kEstimate: 0.038,
  maxThrustSL: 1026800, // 2 × GE90-110B1 @ 513.4 kN
  category: "widebody",
});

// 40. Boeing 747-400F
reg({
  typeDesignator: "B74Y",
  name: "Boeing 747-400F",
  wingArea: 541.2,
  wingSpan: 64.4,
  mtow: 412775,
  oew: 178756,
  engineCount: 4,
  engineType: "turbofan",
  typicalCruiseMach: 0.845,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.022,
  kEstimate: 0.042,
  maxThrustSL: 1016000, // 4 × CF6-80C2B1F @ 254 kN
  category: "widebody",
});

// 41. Airbus A330-200F
reg({
  typeDesignator: "A33X",
  name: "Airbus A330-200F",
  wingArea: 361.6,
  wingSpan: 60.3,
  mtow: 233000,
  oew: 121700,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.82,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.023,
  kEstimate: 0.039,
  maxThrustSL: 604600, // 2 × Trent 772B
  category: "widebody",
});

// ========================== MILITARY =======================================

// 42. KC-135 Stratotanker
reg({
  typeDesignator: "K35R",
  name: "Boeing KC-135 Stratotanker",
  wingArea: 226.0,
  wingSpan: 39.9,
  mtow: 146285,
  oew: 44663,
  engineCount: 4,
  engineType: "turbofan",
  typicalCruiseMach: 0.77,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.025,
  kEstimate: 0.048, // AR=7.04, e~0.80
  maxThrustSL: 396000, // 4 × CFM56-2B1 @ 99 kN
  category: "widebody",
});

// 43. Lockheed C-130J Super Hercules
reg({
  typeDesignator: "C30J",
  name: "Lockheed C-130J Super Hercules",
  wingArea: 162.1,
  wingSpan: 40.4,
  mtow: 74389,
  oew: 34274,
  engineCount: 4,
  engineType: "turboprop",
  typicalCruiseMach: 0.48,
  typicalCruiseAltitude: 8534, // FL280
  cd0Estimate: 0.028,
  kEstimate: 0.041, // AR=10.07, e~0.80
  maxThrustSL: 96000, // 4 × AE2100D3 (approx static equivalent)
  category: "turboprop",
});

// 44. Boeing C-17 Globemaster III
reg({
  typeDesignator: "C17",
  name: "Boeing C-17 Globemaster III",
  wingArea: 353.0,
  wingSpan: 51.7,
  mtow: 265352,
  oew: 128100,
  engineCount: 4,
  engineType: "turbofan",
  typicalCruiseMach: 0.77,
  typicalCruiseAltitude: 8534,
  cd0Estimate: 0.025,
  kEstimate: 0.042, // AR=7.57, e~0.80
  maxThrustSL: 720000, // 4 × F117-PW-100 @ 180 kN
  category: "widebody",
});

// ========================== MORE NARROWBODY ================================

// 45. Boeing 737-300
reg({
  typeDesignator: "B733",
  name: "Boeing 737-300",
  wingArea: 105.4,
  wingSpan: 28.9,
  mtow: 63276,
  oew: 32705,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.745,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.025,
  kEstimate: 0.050, // AR=7.92, e~0.82
  maxThrustSL: 178000, // 2 × CFM56-3B1 @ 89 kN
  category: "narrowbody",
});

// 46. Boeing 737-400
reg({
  typeDesignator: "B734",
  name: "Boeing 737-400",
  wingArea: 105.4,
  wingSpan: 28.9,
  mtow: 68039,
  oew: 33200,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.745,
  typicalCruiseAltitude: 10668,
  cd0Estimate: 0.025,
  kEstimate: 0.050,
  maxThrustSL: 196000, // 2 × CFM56-3C1 @ 98 kN
  category: "narrowbody",
});

// 47. Airbus A318
reg({
  typeDesignator: "A318",
  name: "Airbus A318",
  wingArea: 122.6,
  wingSpan: 35.8,
  mtow: 68000,
  oew: 39300,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.024,
  kEstimate: 0.040,
  maxThrustSL: 213400, // 2 × PW6122A @ 106.7 kN
  category: "narrowbody",
});

// 48. Boeing 737 MAX 9
reg({
  typeDesignator: "B39M",
  name: "Boeing 737 MAX 9",
  wingArea: 127.0,
  wingSpan: 35.9,
  mtow: 88314,
  oew: 49190,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.79,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.023,
  kEstimate: 0.042,
  maxThrustSL: 254200, // 2 × LEAP-1B28
  category: "narrowbody",
});

// 49. Airbus A320neo
reg({
  typeDesignator: "A20N",
  name: "Airbus A320neo",
  wingArea: 122.6,
  wingSpan: 35.8,
  mtow: 79000,
  oew: 44300,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.023,
  kEstimate: 0.040,
  maxThrustSL: 240200, // 2 × LEAP-1A26 @ 120.1 kN
  category: "narrowbody",
});

// 50. Airbus A319neo
reg({
  typeDesignator: "A19N",
  name: "Airbus A319neo",
  wingArea: 122.6,
  wingSpan: 35.8,
  mtow: 75500,
  oew: 41000,
  engineCount: 2,
  engineType: "turbofan",
  typicalCruiseMach: 0.78,
  typicalCruiseAltitude: 11278,
  cd0Estimate: 0.023,
  kEstimate: 0.040,
  maxThrustSL: 222400, // 2 × LEAP-1A24 @ 111.2 kN
  category: "narrowbody",
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up an aircraft type by ICAO type designator.
 * Returns undefined if the type is not in the database.
 */
export function getAircraftType(
  typeDesignator: string,
): AircraftTypeData | undefined {
  return AIRCRAFT_DATABASE.get(typeDesignator.toUpperCase());
}

/**
 * Return all aircraft types in the database.
 */
export function getAllAircraftTypes(): AircraftTypeData[] {
  return Array.from(AIRCRAFT_DATABASE.values());
}

/**
 * Build an AircraftConfig suitable for dynamics modeling from a type designator.
 *
 * If `estimatedMass` is not provided, a mid-range estimate (average of MTOW
 * and OEW, i.e. roughly half fuel load) is used.
 */
export function getAircraftConfig(
  typeDesignator: string,
  estimatedMass?: number,
): AircraftConfig | undefined {
  const data = getAircraftType(typeDesignator);
  if (!data) return undefined;
  return {
    mass: estimatedMass ?? (data.mtow + data.oew) / 2,
    wingArea: data.wingArea,
    wingSpan: data.wingSpan,
    maxThrust: data.maxThrustSL,
    engineCount: data.engineCount,
  };
}
