// ==================== UTILIZATION MANAGER - SIMPLIFIED ====================
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

    // Get current visit frequencies
    const visitFrequencies = this.getVisitFrequencies();

    // Find optimal priority set
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
        // Validate that priorities have meaningful visit frequency
        const validPriorities = priorities.filter((priority) => {
          const frequency = visitFrequencies[priority];
          return (
            frequency && frequency >= CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY
          );
        });

        if (validPriorities.length > 0) {
          const finalKey = validPriorities.join(",");
          const finalUtilization = utilizations[finalKey] || utilizations[key];

          Utils.log(
            `Selected priorities: ${finalKey} with ${finalUtilization}% utilization`,
            "INFO"
          );

          return {
            includePriorities: validPriorities,
            utilization: finalUtilization,
            visitFrequencies: visitFrequencies,
          };
        }
      }
    }

    // Fallback: P1 only if it has valid frequency
    if (
      visitFrequencies["P1"] &&
      visitFrequencies["P1"] >= CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY
    ) {
      Utils.log("Falling back to P1 only", "WARN");
      return {
        includePriorities: ["P1"],
        utilization: utilizations["P1"] || 100,
        visitFrequencies: visitFrequencies,
      };
    }

    throw new Error(
      `No valid priorities found! P1 frequency must be >= ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY}`
    );
  }

  // Get visit frequencies with fractional support
  getVisitFrequencies() {
    const ranges = ["B24", "B25", "B26", "B27", "B28", "B29", "B30", "B31"];
    const priorities = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
    const frequencies = {};

    priorities.forEach((priority, i) => {
      try {
        const value = this.sheet.getRange(ranges[i]).getValue();
        let frequency = parseFloat(value);

        if (isNaN(frequency) || frequency < 0) {
          frequency = 0;
        }

        // Round very small numbers to 0
        if (
          frequency < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY &&
          frequency > 0
        ) {
          Utils.log(
            `${priority} frequency ${frequency} rounded to 0 (below minimum)`,
            "WARN"
          );
          frequency = 0;
        }

        frequencies[priority] = frequency;
      } catch (e) {
        Utils.log(`Error reading frequency for ${priority}: ${e}`, "ERROR");
        frequencies[priority] = 0;
      }
    });

    return frequencies;
  }
}
