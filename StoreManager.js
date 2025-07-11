// ==================== ENHANCED STORE MANAGER ====================
class StoreManager {
  constructor(sheet) {
    this.sheet = sheet;
  }

  // ENHANCED: Update visit frequencies with fractional support
  updateVisitFrequencies() {
    const ranges = ["B24", "B25", "B26", "B27", "B28", "B29", "B30", "B31"];
    const priorities = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

    priorities.forEach((priority, i) => {
      try {
        const value = this.sheet.getRange(ranges[i]).getValue();
        let frequency = parseFloat(value); // Support decimals

        if (isNaN(frequency) || frequency < 0) {
          frequency = 0;
        }

        // Round very small frequencies to 0
        if (
          frequency < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY &&
          frequency > 0
        ) {
          frequency = 0;
        }

        CONFIG.PRIORITIES[priority].requiredVisits = frequency;
        Utils.log(
          `${priority} visit frequency updated to: ${Utils.formatFrequency(
            frequency
          )}`,
          "INFO"
        );
      } catch (e) {
        Utils.log(
          "Error reading visit frequency for " + priority + ": " + e,
          "ERROR"
        );
        CONFIG.PRIORITIES[priority].requiredVisits = 0;
      }
    });
  }

  // ENHANCED: Load stores with fractional visit calculation
  loadStores(includePriorities) {
    const stores = [];
    const lastRow = this.sheet.getLastRow();

    Object.entries(CONFIG.PRIORITIES).forEach(([priority, config]) => {
      // Only process priorities that are included AND have meaningful frequency
      if (!includePriorities.includes(priority)) {
        Utils.log(
          `Skipping priority ${priority}: not in included priorities`,
          "INFO"
        );
        return;
      }

      if (config.requiredVisits < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY) {
        Utils.log(
          `Skipping priority ${priority}: visit frequency is ${config.requiredVisits}`,
          "INFO"
        );
        return;
      }

      const col = config.startCol;
      let priorityCount = 0;
      let storeIndex = 0; // For fractional calculation

      for (let row = 4; row <= lastRow; row++) {
        try {
          const shouldVisit = this.sheet.getRange(row, col + 11).getValue();
          if (shouldVisit !== "YES" && shouldVisit !== true) continue;

          const name = this.sheet.getRange(row, col + 1).getValue();
          if (!name) continue;

          const lat = parseFloat(this.sheet.getRange(row, col + 6).getValue());
          const lng = parseFloat(this.sheet.getRange(row, col + 7).getValue());
          if (isNaN(lat) || isNaN(lng)) continue;

          // ENHANCED: Calculate actual visits for this store based on frequency
          const actualVisits = Utils.calculateActualVisits(
            config.requiredVisits,
            1, // Single store
            storeIndex,
            priority
          );

          const store = {
            priority,
            priorityNum: parseInt(priority.charAt(1)),
            noStr: this.sheet.getRange(row, col).getValue() || "",
            name,
            retailer: this.sheet.getRange(row, col + 2).getValue() || "",
            district: this.sheet.getRange(row, col + 3).getValue() || "Unknown",
            state: this.sheet.getRange(row, col + 4).getValue() || "",
            address: this.sheet.getRange(row, col + 5).getValue() || "",
            lat,
            lng,
            salesL6M:
              parseFloat(this.sheet.getRange(row, col + 8).getValue()) || 0,
            rank: parseInt(this.sheet.getRange(row, col + 9).getValue()) || 999,
            visibility: this.sheet.getRange(row, col + 10).getValue() || "",

            // ENHANCED: Visit frequency handling
            baseFrequency: config.requiredVisits, // Original frequency (e.g., 0.79)
            actualVisits: actualVisits, // Calculated visits for this month (0 or 1 for fractional)
            visits: actualVisits, // For backward compatibility
            visitTime: CONFIG.DEFAULT_VISIT_TIME,

            // Additional info for reporting
            storeIndex: storeIndex,
            lastVisitCalculation: `${config.requiredVisits} freq → ${actualVisits} visits`,
            isFractionalVisit: config.requiredVisits < 1 && actualVisits > 0,

            // NEW: Mall clustering placeholders (will be populated by RouteOptimizer)
            mallClusterId: null,
            mallClusterInfo: null,
          };

          // Only add stores that will be visited this month
          if (actualVisits > 0) {
            stores.push(store);
            priorityCount++;
          }

          storeIndex++;
        } catch (e) {
          Utils.log(
            `Error processing row ${row} for priority ${priority}: ${e}`,
            "ERROR"
          );
          continue;
        }
      }

      const totalStoresInPriority = storeIndex;
      const expectedVisits = Utils.calculateExpectedVisits(
        config.requiredVisits,
        totalStoresInPriority
      );

      Utils.log(
        `${priority}: Loaded ${priorityCount}/${totalStoresInPriority} stores (expected: ${expectedVisits}, frequency: ${Utils.formatFrequency(
          config.requiredVisits
        )})`,
        "INFO"
      );
    });

    Utils.log("Total stores loaded for this month: " + stores.length, "INFO");
    return stores;
  }

  // Get store statistics for reporting
  getStoreStatistics(includePriorities) {
    const stats = {
      byPriority: {},
      totals: {
        totalStores: 0,
        scheduledStores: 0,
        expectedVisits: 0,
        actualVisits: 0,
      },
    };

    const lastRow = this.sheet.getLastRow();

    Object.entries(CONFIG.PRIORITIES).forEach(([priority, config]) => {
      if (!includePriorities.includes(priority)) return;

      const col = config.startCol;
      let totalStores = 0;
      let scheduledStores = 0;
      let storeIndex = 0;

      for (let row = 4; row <= lastRow; row++) {
        try {
          const shouldVisit = this.sheet.getRange(row, col + 11).getValue();
          if (shouldVisit !== "YES" && shouldVisit !== true) continue;

          const name = this.sheet.getRange(row, col + 1).getValue();
          if (!name) continue;

          totalStores++;

          const actualVisits = Utils.calculateActualVisits(
            config.requiredVisits,
            1,
            storeIndex,
            priority
          );

          if (actualVisits > 0) {
            scheduledStores++;
          }

          storeIndex++;
        } catch (e) {
          continue;
        }
      }

      const expectedVisits = Utils.calculateExpectedVisits(
        config.requiredVisits,
        totalStores
      );

      stats.byPriority[priority] = {
        frequency: config.requiredVisits,
        totalStores,
        scheduledStores,
        expectedVisits,
        actualVisits: scheduledStores, // For fractional, scheduled = actual visits
        coverageRate:
          totalStores > 0 ? (scheduledStores / totalStores) * 100 : 0,
      };

      stats.totals.totalStores += totalStores;
      stats.totals.scheduledStores += scheduledStores;
      stats.totals.expectedVisits += expectedVisits;
      stats.totals.actualVisits += scheduledStores;
    });

    return stats;
  }

  // Preview fractional visit distribution for testing
  previewFractionalDistribution(priority, sampleSize = 20) {
    const frequency = CONFIG.PRIORITIES[priority]?.requiredVisits || 0;
    if (frequency >= 1 || frequency < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY) {
      return null;
    }

    const preview = [];
    for (let i = 0; i < sampleSize; i++) {
      const visits = Utils.calculateActualVisits(frequency, 1, i, priority);
      preview.push({
        storeIndex: i,
        visits: visits,
        willVisit: visits > 0,
      });
    }

    const visitCount = preview.filter((p) => p.willVisit).length;
    const expectedCount = Math.round(sampleSize * frequency);

    Utils.log(
      `${priority} fractional preview (${sampleSize} stores): ${visitCount} will be visited (expected: ${expectedCount})`,
      "INFO"
    );

    return {
      frequency,
      sampleSize,
      actualVisits: visitCount,
      expectedVisits: expectedCount,
      distribution: preview,
      accuracy:
        Math.abs(visitCount - expectedCount) <= 1 ? "Good" : "Needs adjustment",
    };
  }

  // NEW: Test mall detection on loaded stores
  testMallDetection(includePriorities) {
    const stores = this.loadStores(includePriorities);

    if (stores.length < 2) {
      return {
        success: false,
        message: "Need at least 2 stores to test mall detection",
        stores: stores.length,
      };
    }

    // Simple proximity test
    const mallCandidates = [];
    const processed = new Set();

    stores.forEach((store, index) => {
      if (processed.has(index)) return;

      const nearbyStores = [store];
      processed.add(index);

      stores.forEach((otherStore, otherIndex) => {
        if (processed.has(otherIndex)) return;

        const distance = Utils.distance(
          store.lat,
          store.lng,
          otherStore.lat,
          otherStore.lng
        );

        if (distance <= CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD) {
          nearbyStores.push(otherStore);
          processed.add(otherIndex);
        }
      });

      if (nearbyStores.length > 1) {
        mallCandidates.push({
          stores: nearbyStores,
          storeCount: nearbyStores.length,
          priorities: [...new Set(nearbyStores.map((s) => s.priority))],
          retailers: [...new Set(nearbyStores.map((s) => s.retailer))],
        });
      }
    });

    return {
      success: true,
      totalStores: stores.length,
      mallCandidates: mallCandidates.length,
      storesInMalls: mallCandidates.reduce(
        (sum, candidate) => sum + candidate.storeCount,
        0
      ),
      details: mallCandidates.slice(0, 5), // First 5 for preview
      settings: {
        proximityThreshold:
          CONFIG.CLUSTERING.MALL_DETECTION.PROXIMITY_THRESHOLD,
        maxStoresPerMall: CONFIG.CLUSTERING.MALL_DETECTION.MAX_STORES_PER_MALL,
      },
    };
  }
}
