// ==================== ENHANCED CONFIGURATION ====================
const CONFIG = {
  SHEET_NAME: "Callplan MY",
  BUFFER_TIME: 5,
  LUNCH: { START: 12 * 60, END: 13 * 60 },
  FRIDAY_PRAYER: { START: 11 * 60 + 30, END: 13 * 60 },
  WORK: { START: 9 * 60, END: 18 * 60 + 20 },
  DEFAULT_VISIT_TIME: 30,
  MAPS_API_KEY: "", // Replace with your actual API key

  CLUSTERING: {
    MAX_RADIUS: 25, // Regional clustering radius (km)
    MIN_STORES_PER_DAY: 6,
    MAX_STORES_PER_DAY: 15,
    TARGET_STORES_PER_DAY: 12, // NEW: Target for balanced distribution

    // Enhanced mall detection
    MALL_DETECTION: {
      PROXIMITY_THRESHOLD: 0.2, // 200 meters for same mall/building
      MAX_STORES_PER_MALL: 3,
      ENABLE_MALL_CLUSTERING: true,
    },

    // NEW: Geographic optimization settings
    GEOGRAPHIC: {
      GRID_SIZE: 0.1, // ~1.1km grid cells for spatial indexing
      CLUSTERING_METHOD: "KMEANS", // KMEANS or DBSCAN
      OPTIMIZE_ROUTES: true, // Enable 2-opt optimization
      BALANCE_LOAD: true, // Enable load balancing across days
    },
  },

  PRIORITIES: {
    P1: { startCol: 7, requiredVisits: 2 },
    P2: { startCol: 21, requiredVisits: 1 },
    P3: { startCol: 28, requiredVisits: 1 },
    P4: { startCol: 35, requiredVisits: 1 },
    P5: { startCol: 42, requiredVisits: 1 },
    P6: { startCol: 49, requiredVisits: 1 },
    P7: { startCol: 56, requiredVisits: 1 },
    P8: { startCol: 63, requiredVisits: 1 },
  },

  START: { LAT: 3.006902971094009, LNG: 101.76718109065438 },

  // Fractional visit frequency settings
  FRACTIONAL_VISITS: {
    MIN_FREQUENCY: 0.1,
    ROUNDING_METHOD: "PROBABILITY",
    SEED_MULTIPLIER: 1000,
  },

  // NEW: Travel constraints
  TRAVEL_LIMITS: {
    MAX_DISTANCE_FROM_HOME: 40, // Maximum 40km from home base
    MAX_DAILY_DISTANCE: 150, // Maximum 150km travel per day
    AVG_SPEED_CITY: 20, // 20 km/h in city
    AVG_SPEED_HIGHWAY: 60, // 60 km/h on highway
  },
};

// ==================== ENHANCED UTILITIES ====================
const Utils = {
  distance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${mins.toString().padStart(2, "0")} ${period}`;
  },

  mapsLink(fromLat, fromLng, toLat, toLng) {
    return `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`;
  },

  parsePercentage(displayVal) {
    if (!displayVal) return 0;
    if (displayVal.toString().includes("%")) {
      return parseFloat(displayVal.toString().replace("%", ""));
    }
    return parseFloat(displayVal) || 0;
  },

  // Enhanced logging with levels
  log(message, type = "INFO") {
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    console.log(`[${timestamp}] [${type}] ${message}`);
  },

  // NEW: Mall detection utilities
  detectMallProximity(store1, store2) {
    const distance = this.distance(
      store1.lat,
      store1.lng,
      store2.lat,
      store2.lng
    );
    const threshold = CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD;

    return {
      isSameMall: distance <= threshold,
      distance: distance,
      isVeryClose: distance <= threshold * 0.5, // Within 100m = very close
      proximityScore: Math.max(0, (threshold - distance) / threshold),
    };
  },

  // NEW: Generate mall cluster ID based on coordinates
  generateMallId(stores) {
    if (!stores.length) return null;

    const centerLat = stores.reduce((sum, s) => sum + s.lat, 0) / stores.length;
    const centerLng = stores.reduce((sum, s) => sum + s.lng, 0) / stores.length;

    // Create unique ID based on rounded coordinates
    const latKey = Math.round(centerLat * 1000);
    const lngKey = Math.round(centerLng * 1000);

    return `MALL_${latKey}_${lngKey}`;
  },

  // NEW: Analyze mall cluster composition
  analyzeMallCluster(stores) {
    const priorities = stores.map((s) => s.priority);
    const uniquePriorities = [...new Set(priorities)];
    const retailers = stores.map((s) => s.retailer).filter((r) => r);
    const uniqueRetailers = [...new Set(retailers)];

    const centerLat = stores.reduce((sum, s) => sum + s.lat, 0) / stores.length;
    const centerLng = stores.reduce((sum, s) => sum + s.lng, 0) / stores.length;

    // Calculate spread within cluster
    const distances = stores.map((s) =>
      this.distance(centerLat, centerLng, s.lat, s.lng)
    );
    const maxSpread = Math.max(...distances);

    return {
      storeCount: stores.length,
      priorities: uniquePriorities.sort(),
      retailers: uniqueRetailers,
      centerLat: centerLat,
      centerLng: centerLng,
      maxSpread: maxSpread,
      isCompactCluster:
        maxSpread <= CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD * 0.5,
      priorityMix: priorities.length > uniquePriorities.length, // Has mixed priorities
      retailerMix: retailers.length > uniqueRetailers.length, // Has mixed retailers
    };
  },

  // NEW: Format mall cluster info for display
  formatMallInfo(mallInfo) {
    if (!mallInfo) return "Individual store";

    const { storeCount, priorities } = mallInfo;
    return `Mall cluster (${storeCount} stores: ${priorities.join(", ")})`;
  },

  // NEW: Calculate travel time between stores considering mall proximity
  calculateTravelTime(store1, store2) {
    const distance = this.distance(
      store1.lat,
      store1.lng,
      store2.lat,
      store2.lng
    );

    // Check if stores are in same mall
    const isSameMall =
      store1.mallClusterId && store1.mallClusterId === store2.mallClusterId;

    if (isSameMall) {
      // Walking time within mall (minimum 2 minutes)
      return Math.max(2, Math.round(distance * 15)); // 15 min per km for walking
    } else if (
      distance <= CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD
    ) {
      // Very close stores (likely same building complex)
      return Math.max(3, Math.round(distance * 20)); // 20 min per km for short drives
    } else {
      // Normal driving time between different locations
      return Math.round(distance * 3); // 3 min per km for normal driving
    }
  },

  // NEW: Validate mall cluster constraints
  validateMallCluster(stores) {
    if (stores.length <= 1) return { valid: true, reason: "Single store" };

    const maxStores = CONFIG.CLUSTERING.MALL_DETECTION.MAX_STORES_PER_MALL;
    if (stores.length > maxStores) {
      return {
        valid: false,
        reason: `Too many stores (${stores.length} > ${maxStores})`,
      };
    }

    // Check if all stores are within proximity threshold
    const centerLat = stores.reduce((sum, s) => sum + s.lat, 0) / stores.length;
    const centerLng = stores.reduce((sum, s) => sum + s.lng, 0) / stores.length;

    const maxDistance = Math.max(
      ...stores.map((s) => this.distance(centerLat, centerLng, s.lat, s.lng))
    );

    const threshold = CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD;
    if (maxDistance > threshold) {
      return {
        valid: false,
        reason: `Stores too spread out (${maxDistance.toFixed(
          2
        )}km > ${threshold}km)`,
      };
    }

    return { valid: true, reason: "Valid mall cluster" };
  },

  // Existing fractional visit utilities
  calculateActualVisits(frequency, storeCount, storeIndex = 0, priority = "") {
    if (frequency <= 0) return 0;
    if (frequency >= 1) return Math.floor(frequency);

    const fractionalPart = frequency - Math.floor(frequency);

    if (CONFIG.FRACTIONAL_VISITS.ROUNDING_METHOD === "PROBABILITY") {
      const seed = this.generateSeed(storeIndex, priority);
      const random = this.seededRandom(seed);
      return random < fractionalPart ? 1 : 0;
    } else {
      const interval = Math.round(1 / fractionalPart);
      return storeIndex % interval === 0 ? 1 : 0;
    }
  },

  generateSeed(storeIndex, priority) {
    const priorityNum = parseInt(priority.replace("P", "")) || 1;
    return (
      (storeIndex + priorityNum * 100) *
      CONFIG.FRACTIONAL_VISITS.SEED_MULTIPLIER
    );
  },

  seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  },

  calculateExpectedVisits(frequency, storeCount) {
    if (frequency <= 0) return 0;
    if (frequency >= 1) return storeCount * Math.floor(frequency);
    return Math.round(storeCount * frequency);
  },

  formatFrequency(frequency) {
    if (frequency >= 1) {
      return `${frequency.toFixed(0)} times/month`;
    } else if (frequency > 0) {
      const daysInterval = Math.round(30 / frequency);
      const workDaysInterval = Math.round(22 / frequency);
      return `${frequency.toFixed(
        2
      )} times/month (~every ${workDaysInterval} work days)`;
    }
    return "0 times/month";
  },
};
