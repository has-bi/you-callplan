// ==================== UTILIZATION MANAGER ====================
class UtilizationManager {
  constructor(sheet) {
    this.sheet = sheet;
  }

  getConfig() {
    const ranges = ["D42", "D43", "D44", "D45", "D46", "D47", "D48", "D49"];
    const keys = [
      "P1",
      "P1,P2",
      "P1,P2,P3",
      "P1,P2,P3,P4",
      "P1,P2,P3,P4,P5",
      "P1,P2,P3,P4,P5,P6",
      "P1,P2,P3,P4,P5,P6,P7",
      "P1,P2,P3,P4,P5,P6,P7,P8",
    ];

    const utilizations = {};
    ranges.forEach((range, i) => {
      try {
        const display = this.sheet.getRange(range).getDisplayValue();
        utilizations[keys[i]] = Utils.parsePercentage(display);
      } catch (e) {
        Utils.log(`Error reading range ${range}: ${e}`, "ERROR");
        utilizations[keys[i]] = 100;
      }
    });

    // Get current visit frequencies to validate priorities
    const visitFrequencies = this.getVisitFrequencies();

    // Find optimal priority set with valid visit frequencies
    const prioritySets = [
      ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"],
      ["P1", "P2", "P3", "P4", "P5", "P6", "P7"],
      ["P1", "P2", "P3", "P4", "P5", "P6"],
      ["P1", "P2", "P3", "P4", "P5"],
      ["P1", "P2", "P3", "P4"],
      ["P1", "P2", "P3"],
      ["P1", "P2"],
      ["P1"],
    ];

    for (const priorities of prioritySets) {
      const key = priorities.join(",");

      // Check if utilization is <= 100%
      if (utilizations[key] && utilizations[key] <= 100) {
        // ENHANCED: Validate that all priorities have meaningful visit frequency
        const validPriorities = priorities.filter((priority) => {
          const frequency = visitFrequencies[priority];
          // Accept frequencies >= minimum threshold (0.1 = once every 10 months)
          const isValid =
            frequency && frequency >= CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY;

          if (!isValid) {
            Utils.log(
              `Priority ${priority} has invalid visit frequency: ${frequency} (min: ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY})`,
              "WARN"
            );
          } else {
            Utils.log(
              `Priority ${priority} accepted with frequency: ${Utils.formatFrequency(
                frequency
              )}`,
              "INFO"
            );
          }

          return isValid;
        });

        // If we have valid priorities, use them
        if (validPriorities.length > 0) {
          const finalKey = validPriorities.join(",");
          const finalUtilization = utilizations[finalKey] || utilizations[key];

          Utils.log(
            `Selected priorities: ${finalKey} with ${finalUtilization}% utilization`,
            "INFO"
          );
          Utils.log(
            `Excluded priorities due to low visit frequency: ${
              priorities
                .filter((p) => !validPriorities.includes(p))
                .join(", ") || "None"
            }`,
            "INFO"
          );

          return {
            includePriorities: validPriorities,
            utilization: finalUtilization,
            allUtilizations: utilizations,
            visitFrequencies: visitFrequencies,
          };
        } else {
          Utils.log(
            `All priorities in set [${key}] have insufficient visit frequency, skipping`,
            "WARN"
          );
        }
      }
    }

    // Fallback: Check if P1 has valid visit frequency
    if (
      visitFrequencies["P1"] &&
      visitFrequencies["P1"] >= CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY
    ) {
      Utils.log(
        "All priority combinations exceed 100% or have insufficient frequencies, falling back to P1 only",
        "WARN"
      );
      return {
        includePriorities: ["P1"],
        utilization: utilizations["P1"] || 100,
        allUtilizations: utilizations,
        visitFrequencies: visitFrequencies,
      };
    }

    // Critical error: No valid priorities
    throw new Error(
      `No valid priorities found! P1 visit frequency must be >= ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY}`
    );
  }

  // ENHANCED: Get visit frequencies with fractional support
  getVisitFrequencies() {
    const ranges = ["B24", "B25", "B26", "B27", "B28", "B29", "B30", "B31"];
    const priorities = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
    const frequencies = {};

    priorities.forEach((priority, i) => {
      try {
        const value = this.sheet.getRange(ranges[i]).getValue();
        let frequency = parseFloat(value); // Support decimals like 0.79

        if (isNaN(frequency) || frequency < 0) {
          frequency = 0; // Set to 0 if invalid or negative
        }

        // Round very small numbers to 0
        if (
          frequency < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY &&
          frequency > 0
        ) {
          Utils.log(
            `${priority} frequency ${frequency} rounded to 0 (below minimum ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY})`,
            "WARN"
          );
          frequency = 0;
        }

        frequencies[priority] = frequency;
        Utils.log(
          `${priority} visit frequency: ${Utils.formatFrequency(frequency)}`,
          "INFO"
        );
      } catch (e) {
        Utils.log(
          `Error reading visit frequency for ${priority}: ${e}`,
          "ERROR"
        );
        frequencies[priority] = 0; // Default to 0 on error
      }
    });

    return frequencies;
  }

  // NEW: Calculate expected visits for all priorities
  calculateExpectedVisits(stores) {
    const expectedByPriority = {};
    const actualByPriority = {};

    Object.keys(CONFIG.PRIORITIES).forEach((priority) => {
      const priorityStores = stores.filter((s) => s.priority === priority);
      const frequency = CONFIG.PRIORITIES[priority].requiredVisits;

      expectedByPriority[priority] = Utils.calculateExpectedVisits(
        frequency,
        priorityStores.length
      );
      actualByPriority[priority] = priorityStores.reduce(
        (sum, store) => sum + (store.actualVisits || 0),
        0
      );
    });

    return {
      expected: expectedByPriority,
      actual: actualByPriority,
      total: {
        expected: Object.values(expectedByPriority).reduce(
          (sum, val) => sum + val,
          0
        ),
        actual: Object.values(actualByPriority).reduce(
          (sum, val) => sum + val,
          0
        ),
      },
    };
  }
}
