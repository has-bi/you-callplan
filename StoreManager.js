// ==================== STORE MANAGER - SIMPLIFIED ====================
class StoreManager {
  constructor(sheet) {
    this.sheet = sheet;
  }

  // Update visit frequencies with fractional support
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

        // Round very small frequencies to 0
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

  // Load stores with fractional visit calculation
  loadStores(includePriorities) {
    const stores = [];
    const lastRow = this.sheet.getLastRow();

    Object.entries(CONFIG.PRIORITIES).forEach(([priority, config]) => {
      if (!includePriorities.includes(priority)) return;
      if (config.requiredVisits < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY)
        return;

      const col = config.startCol;
      let storeIndex = 0;

      for (let row = 4; row <= lastRow; row++) {
        try {
          const shouldVisit = this.sheet.getRange(row, col + 11).getValue();
          if (shouldVisit !== "YES" && shouldVisit !== true) continue;

          const name = this.sheet.getRange(row, col + 1).getValue();
          if (!name) continue;

          const lat = parseFloat(this.sheet.getRange(row, col + 6).getValue());
          const lng = parseFloat(this.sheet.getRange(row, col + 7).getValue());
          if (isNaN(lat) || isNaN(lng)) continue;

          // FIXED: Calculate actual visits for this store based on frequency
          const actualVisits = Utils.calculateActualVisits(
            config.requiredVisits,
            1,
            storeIndex,
            priority
          );

          const store = {
            priority,
            noStr: this.sheet.getRange(row, col).getValue() || "",
            name,
            retailer: this.sheet.getRange(row, col + 2).getValue() || "",
            district: this.sheet.getRange(row, col + 3).getValue() || "Unknown",
            address: this.sheet.getRange(row, col + 5).getValue() || "",
            lat,
            lng,
            salesL6M:
              parseFloat(this.sheet.getRange(row, col + 8).getValue()) || 0,

            // Visit frequency handling
            baseFrequency: config.requiredVisits,
            actualVisits: actualVisits,
            visits: actualVisits,
            visitTime: CONFIG.DEFAULT_VISIT_TIME,
            isFractionalVisit: config.requiredVisits < 1 && actualVisits > 0,
          };

          // Only add stores that will be visited this month
          if (actualVisits > 0) {
            stores.push(store);
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
    });

    Utils.log("Total stores loaded for this month: " + stores.length, "INFO");
    return stores;
  }

  // Get store statistics for reporting
  getStoreStatistics(includePriorities) {
    const stats = {
      byPriority: {},
      totals: { totalStores: 0, scheduledStores: 0, expectedVisits: 0 },
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
      };

      stats.totals.totalStores += totalStores;
      stats.totals.scheduledStores += scheduledStores;
      stats.totals.expectedVisits += expectedVisits;
    });

    return stats;
  }
}
