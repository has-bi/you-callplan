// ==================== STORE MANAGER - FIXED WITH UNIQUE DEDUPLICATION ====================
class StoreManager {
  constructor(sheet) {
    this.sheet = sheet;
  }

  updateVisitFrequencies() {
    const ranges = ["B24", "B25", "B26", "B27", "B28", "B29", "B30", "B31"];
    const priorities = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

    priorities.forEach((priority, i) => {
      try {
        const value = this.sheet.getRange(ranges[i]).getValue();
        let frequency = parseFloat(value);

        if (isNaN(frequency) || frequency < 0) {
          frequency = 0;
        }

        if (
          frequency < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY &&
          frequency > 0
        ) {
          frequency = 0;
        }

        CONFIG.PRIORITIES[priority].requiredVisits = frequency;
        Utils.log(
          `${priority} frequency: ${Utils.formatFrequency(frequency)}`,
          "INFO"
        );
      } catch (e) {
        Utils.log(
          "Error reading frequency for " + priority + ": " + e,
          "ERROR"
        );
        CONFIG.PRIORITIES[priority].requiredVisits = 0;
      }
    });
  }

  // FIXED: Load stores with unique deduplication by noStr
  loadStores(includePriorities) {
    Utils.log(
      `Loading stores for priorities: ${includePriorities.join(", ")}`,
      "INFO"
    );

    const allStores = [];
    const storeMap = new Map(); // Use Map for deduplication by noStr
    const lastRow = this.sheet.getLastRow();

    Object.entries(CONFIG.PRIORITIES).forEach(([priority, config]) => {
      if (!includePriorities.includes(priority)) return;
      if (config.requiredVisits < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY)
        return;

      const col = config.startCol;
      let storeIndex = 0;
      let loadedForThisPriority = 0;
      let skippedDuplicates = 0;

      Utils.log(
        `Processing ${priority} (column ${col}, frequency: ${config.requiredVisits})...`,
        "INFO"
      );

      for (let row = 4; row <= lastRow; row++) {
        try {
          const shouldVisit = this.sheet.getRange(row, col + 11).getValue();
          if (shouldVisit !== "YES" && shouldVisit !== true) continue;

          const name = this.sheet.getRange(row, col + 1).getValue();
          if (!name) continue;

          const noStr = this.sheet.getRange(row, col).getValue() || "";

          // DEDUPLICATION: Check if we already have this store by noStr
          if (storeMap.has(noStr)) {
            Utils.log(
              `Skipping duplicate store: ${noStr} (${name}) - already loaded as ${
                storeMap.get(noStr).priority
              }`,
              "WARN"
            );
            skippedDuplicates++;
            continue;
          }

          const lat = parseFloat(this.sheet.getRange(row, col + 6).getValue());
          const lng = parseFloat(this.sheet.getRange(row, col + 7).getValue());
          if (isNaN(lat) || isNaN(lng)) continue;

          // Calculate actual visits for this store
          const actualVisits = Utils.calculateActualVisits(
            config.requiredVisits,
            1,
            storeIndex,
            priority
          );

          const store = {
            priority,
            noStr: noStr,
            name,
            retailer: this.sheet.getRange(row, col + 2).getValue() || "",
            district: this.sheet.getRange(row, col + 3).getValue() || "Unknown",
            address: this.sheet.getRange(row, col + 5).getValue() || "",
            lat,
            lng,
            salesL6M:
              parseFloat(this.sheet.getRange(row, col + 8).getValue()) || 0,
            baseFrequency: config.requiredVisits,
            actualVisits: actualVisits,
            visits: actualVisits,
            visitTime: CONFIG.DEFAULT_VISIT_TIME,
            isFractionalVisit: config.requiredVisits < 1 && actualVisits > 0,

            // Additional tracking info
            loadedFromRow: row,
            loadedFromPriority: priority,
            storeIndex: storeIndex,
          };

          // Only add stores that will be visited this month
          if (actualVisits > 0) {
            storeMap.set(noStr, store); // Add to map for deduplication
            allStores.push(store);
            loadedForThisPriority++;

            Utils.log(
              `Added: ${noStr} (${name}) as ${priority} - ${actualVisits} visits`,
              "INFO"
            );
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

      Utils.log(
        `${priority} complete: ${loadedForThisPriority} stores loaded, ${skippedDuplicates} duplicates skipped`,
        "INFO"
      );
    });

    // Final unique check and summary
    const uniqueStores = Array.from(storeMap.values());
    const totalDuplicatesRemoved = allStores.length - uniqueStores.length;

    if (totalDuplicatesRemoved > 0) {
      Utils.log(
        `⚠️ DEDUPLICATION: Removed ${totalDuplicatesRemoved} duplicate stores`,
        "WARN"
      );
    }

    Utils.log(
      `✅ UNIQUE STORES LOADED: ${uniqueStores.length} stores for this month`,
      "INFO"
    );

    // Log priority distribution of final unique stores
    const priorityDistribution = {};
    uniqueStores.forEach((store) => {
      priorityDistribution[store.priority] =
        (priorityDistribution[store.priority] || 0) + 1;
    });

    Utils.log("Priority distribution of unique stores:", "INFO");
    Object.entries(priorityDistribution).forEach(([priority, count]) => {
      Utils.log(`  ${priority}: ${count} stores`, "INFO");
    });

    return uniqueStores;
  }

  // Get store statistics with deduplication awareness
  getStoreStatistics(includePriorities) {
    const stats = {
      byPriority: {},
      totals: { totalStores: 0, scheduledStores: 0, expectedVisits: 0 },
    };

    const lastRow = this.sheet.getLastRow();
    const processedStores = new Set(); // Track by noStr to avoid double counting

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

          const noStr = this.sheet.getRange(row, col).getValue() || "";

          // Skip if already processed (deduplication)
          if (processedStores.has(noStr)) continue;
          processedStores.add(noStr);

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
      };

      stats.totals.totalStores += totalStores;
      stats.totals.scheduledStores += scheduledStores;
      stats.totals.expectedVisits += expectedVisits;
    });

    return stats;
  }

  // Debug function to check for duplicates in current data
  checkForDuplicates(includePriorities) {
    Utils.log("=== CHECKING FOR DUPLICATES IN CURRENT DATA ===", "INFO");

    const storesByNoStr = {};
    const lastRow = this.sheet.getLastRow();

    Object.entries(CONFIG.PRIORITIES).forEach(([priority, config]) => {
      if (!includePriorities.includes(priority)) return;

      const col = config.startCol;

      for (let row = 4; row <= lastRow; row++) {
        try {
          const shouldVisit = this.sheet.getRange(row, col + 11).getValue();
          if (shouldVisit !== "YES" && shouldVisit !== true) continue;

          const name = this.sheet.getRange(row, col + 1).getValue();
          if (!name) continue;

          const noStr = this.sheet.getRange(row, col).getValue() || "";

          if (!storesByNoStr[noStr]) {
            storesByNoStr[noStr] = [];
          }

          storesByNoStr[noStr].push({
            priority: priority,
            name: name,
            row: row,
            col: col,
          });
        } catch (e) {
          continue;
        }
      }
    });

    // Find duplicates
    const duplicates = Object.entries(storesByNoStr).filter(
      ([noStr, stores]) => stores.length > 1
    );

    if (duplicates.length === 0) {
      Utils.log("✅ No duplicates found in current data", "INFO");
    } else {
      Utils.log(`❌ Found ${duplicates.length} duplicate stores:`, "ERROR");
      duplicates.forEach(([noStr, stores]) => {
        Utils.log(
          `  ${noStr} (${stores[0].name}): appears in ${stores
            .map((s) => `${s.priority}(row ${s.row})`)
            .join(", ")}`,
          "ERROR"
        );
      });
    }

    return {
      totalStores: Object.keys(storesByNoStr).length,
      duplicates: duplicates,
      duplicateCount: duplicates.length,
    };
  }
}
