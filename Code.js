// ==================== CONFIGURATION ====================
const CONFIG = {
  SHEET_NAME: "Callplan MY",
  BUFFER_TIME: 5,
  LUNCH: { START: 12 * 60, END: 13 * 60 },
  FRIDAY_PRAYER: { START: 11 * 60 + 30, END: 13 * 60 }, // 11:30 AM to 1:00 PM
  WORK: { START: 9 * 60, END: 18 * 60 + 20 },
  DEFAULT_VISIT_TIME: 30,
  MAPS_API_KEY: "AIzaSyDPW3aQWLcFKT3Mi4FcaiGFEzJOoiRjidI",

  CLUSTERING: {
    MAX_RADIUS: 18,
    MIN_STORES_PER_DAY: 6,
    MAX_STORES_PER_DAY: 15,
  },

  PRIORITIES: {
    P1: { startCol: 7, requiredVisits: 2 },
    P2: { startCol: 21, requiredVisits: 1 },
    P3: { startCol: 35, requiredVisits: 1 },
    P4: { startCol: 49, requiredVisits: 1 },
    P5: { startCol: 63, requiredVisits: 1 },
    P6: { startCol: 77, requiredVisits: 1 },
    P7: { startCol: 91, requiredVisits: 1 },
    P8: { startCol: 105, requiredVisits: 1 },
  },

  START: { LAT: 3.006902971094009, LNG: 101.76718109065438 },

  // Fractional visit frequency settings
  FRACTIONAL_VISITS: {
    MIN_FREQUENCY: 0.1, // Minimum 0.1 = once every 10 months
    ROUNDING_METHOD: "PROBABILITY", // 'PROBABILITY' or 'DETERMINISTIC'
    SEED_MULTIPLIER: 1000, // For consistent randomization
  },
};

// ==================== UTILITIES ====================
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

  // NEW: Handle fractional visit frequencies
  calculateActualVisits(frequency, storeCount, storeIndex = 0, priority = "") {
    if (frequency <= 0) return 0;
    if (frequency >= 1) return Math.floor(frequency);

    // For fractional frequencies (0 < frequency < 1)
    const fractionalPart = frequency - Math.floor(frequency);

    if (CONFIG.FRACTIONAL_VISITS.ROUNDING_METHOD === "PROBABILITY") {
      // Use deterministic pseudo-random based on store properties
      const seed = this.generateSeed(storeIndex, priority);
      const random = this.seededRandom(seed);

      // Probability-based: 0.79 means 79% chance of 1 visit, 21% chance of 0 visits
      return random < fractionalPart ? 1 : 0;
    } else {
      // Deterministic distribution: every nth store gets a visit
      const interval = Math.round(1 / fractionalPart);
      return storeIndex % interval === 0 ? 1 : 0;
    }
  },

  // Generate consistent seed for pseudo-random
  generateSeed(storeIndex, priority) {
    const priorityNum = parseInt(priority.replace("P", "")) || 1;
    return (
      (storeIndex + priorityNum * 100) *
      CONFIG.FRACTIONAL_VISITS.SEED_MULTIPLIER
    );
  },

  // Simple seeded random number generator (LCG)
  seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  },

  // Calculate expected visits for reporting
  calculateExpectedVisits(frequency, storeCount) {
    if (frequency <= 0) return 0;
    if (frequency >= 1) return storeCount * Math.floor(frequency);

    // For fractional: expected = total stores * frequency
    return Math.round(storeCount * frequency);
  },

  // Format frequency for display
  formatFrequency(frequency) {
    if (frequency >= 1) {
      return `${frequency.toFixed(0)} times/month`;
    } else if (frequency > 0) {
      const daysInterval = Math.round(30 / frequency);
      const workDaysInterval = Math.round(22 / frequency); // ~22 working days per month
      return `${frequency.toFixed(
        2
      )} times/month (~every ${workDaysInterval} work days)`;
    }
    return "0 times/month";
  },
};
