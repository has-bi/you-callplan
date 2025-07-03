// ==================== MAIN FUNCTION ====================
function generateMonthlyPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
    return;
  }

  try {
    Utils.log("=== STARTING MONTHLY PLAN GENERATION ===", "INFO");
    ss.toast("Reading configuration...", "Processing", -1);

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();
    const outputManager = new OutputManager(ss);

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();

    // Enhanced toast with fractional frequency info
    const fractionalPriorities = utilConfig.includePriorities.filter(
      (p) =>
        utilConfig.visitFrequencies[p] > 0 && utilConfig.visitFrequencies[p] < 1
    );

    let toastMessage = `Including priorities: ${utilConfig.includePriorities.join(
      ", "
    )} (${utilConfig.utilization.toFixed(1)}% utilization)`;
    if (fractionalPriorities.length > 0) {
      toastMessage += `\nFractional frequencies: ${fractionalPriorities.join(
        ", "
      )}`;
    }

    ss.toast(toastMessage, "Processing", 4);

    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (!stores.length) {
      Utils.log("No stores found for selected priorities", "ERROR");
      SpreadsheetApp.getUi().alert(
        'No stores found for selected priorities. Please check visit frequencies are > 0 and stores have "YES" in shouldVisit column.'
      );
      return;
    }

    // Get statistics for better user feedback
    const storeStats = storeManager.getStoreStatistics(
      utilConfig.includePriorities
    );

    ss.toast(
      `Creating optimized plan for ${stores.length} stores (${storeStats.totals.expectedVisits} expected visits)...`,
      "Processing",
      -1
    );

    const planResult = routeOptimizer.optimizePlan(stores);
    outputManager.createSheet(planResult, utilConfig, stores);

    // Enhanced completion message
    const fractionalVisits = planResult.statistics.fractionalVisits || 0;
    let completionMessage = `Monthly plan created successfully! ${planResult.statistics.totalStoresPlanned} visits planned`;
    if (fractionalVisits > 0) {
      completionMessage += ` (${fractionalVisits} from fractional frequencies)`;
    }

    Utils.log(
      "=== PLAN GENERATION COMPLETED: " +
        planResult.statistics.totalStoresPlanned +
        " visits planned ===",
      "INFO"
    );
    ss.toast(completionMessage, "Complete", 5);
  } catch (error) {
    Utils.log("Error during plan generation: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
    console.error(error);
  }
}

// ==================== UTILITY FUNCTIONS ====================
function checkUtilizationOnly() {
  try {
    Utils.log("Checking utilization configuration", "INFO");
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME
    );
    const utilManager = new UtilizationManager(sheet);
    const utilConfig = utilManager.getConfig();

    let message =
      `UTILIZATION ANALYSIS\n\n` +
      `Current Utilization:\n` +
      Object.entries(utilConfig.allUtilizations)
        .map(function (entry) {
          return entry[0] + ": " + entry[1].toFixed(1) + "%";
        })
        .join("\n") +
      `\n\nSelected: ${utilConfig.includePriorities.join(
        ", "
      )} (${utilConfig.utilization.toFixed(1)}%)\n\n` +
      `VISIT FREQUENCIES:\n`;

    // Enhanced frequency display
    Object.entries(utilConfig.visitFrequencies).forEach(function (entry) {
      const priority = entry[0];
      const frequency = entry[1];
      const included = utilConfig.includePriorities.includes(priority)
        ? "✓"
        : "✗";
      const status =
        frequency < CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY
          ? "(Too low)"
          : frequency < 1
          ? "(Fractional)"
          : "(Regular)";

      message += `${priority}: ${Utils.formatFrequency(
        frequency
      )} ${included} ${status}\n`;
    });

    message += `\nMinimum frequency threshold: ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY}\n`;
    message += `Fractional method: ${CONFIG.FRACTIONAL_VISITS.ROUNDING_METHOD}\n\n`;
    message += `This configuration will be used for route planning.`;

    SpreadsheetApp.getUi().alert(
      "Utilization Analysis",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log("Error checking utilization: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert(
      "Error",
      error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function analyzeStoreDistribution() {
  try {
    Utils.log("Analyzing store distribution", "INFO");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    const utilManager = new UtilizationManager(sheet);
    const storeManager = new StoreManager(sheet);

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const stores = storeManager.loadStores(utilConfig.includePriorities);
    const storeStats = storeManager.getStoreStatistics(
      utilConfig.includePriorities
    );

    let message = "STORE DISTRIBUTION ANALYSIS\n\n";

    // Enhanced priority breakdown
    message += "By Priority (Scheduled/Total - Expected/Actual Visits):\n";
    Object.entries(storeStats.byPriority).forEach(([priority, stats]) => {
      const status = utilConfig.includePriorities.includes(priority)
        ? "✓"
        : "✗";
      const freqType = stats.frequency < 1 ? "F" : "R"; // Fractional or Regular

      message += `${priority}: ${stats.scheduledStores}/${stats.totalStores} stores - `;
      message += `${stats.expectedVisits}/${stats.actualVisits} visits `;
      message += `(${stats.coverageRate.toFixed(
        1
      )}%) ${status} [${freqType}]\n`;
    });

    message += `\nTotals: ${storeStats.totals.scheduledStores}/${storeStats.totals.totalStores} stores`;
    message += ` - ${storeStats.totals.expectedVisits}/${storeStats.totals.actualVisits} visits\n\n`;

    // District analysis
    const districtCount = {};
    stores.forEach((store) => {
      const district = store.district || "Unknown";
      if (!districtCount[district])
        districtCount[district] = { total: 0, fractional: 0 };
      districtCount[district].total++;
      if (store.baseFrequency && store.baseFrequency < 1) {
        districtCount[district].fractional++;
      }
    });

    message += "Top Districts (Total/Fractional):\n";
    Object.entries(districtCount)
      .map(function (entry) {
        return {
          district: entry[0],
          total: entry[1].total,
          fractional: entry[1].fractional,
        };
      })
      .sort(function (a, b) {
        return b.total - a.total;
      })
      .slice(0, 10)
      .forEach(function (item) {
        message += `${item.district}: ${item.total}`;
        if (item.fractional > 0) {
          message += ` (${item.fractional} fractional)`;
        }
        message += "\n";
      });

    message += `\nLegend: ✓=Included, ✗=Excluded, F=Fractional, R=Regular`;

    SpreadsheetApp.getUi().alert(
      "Store Distribution",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log("Error analyzing distribution: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert(
      "Error",
      error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

// NEW: Test fractional frequency distribution
function testFractionalDistribution() {
  try {
    Utils.log("Testing fractional frequency distribution", "INFO");
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME
    );
    const storeManager = new StoreManager(sheet);

    storeManager.updateVisitFrequencies();

    let message = "FRACTIONAL FREQUENCY TEST\n\n";
    message += `Method: ${CONFIG.FRACTIONAL_VISITS.ROUNDING_METHOD}\n`;
    message += `Min Frequency: ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY}\n\n`;

    const priorities = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];

    priorities.forEach((priority) => {
      const frequency = CONFIG.PRIORITIES[priority].requiredVisits;

      if (frequency > 0 && frequency < 1) {
        const preview = storeManager.previewFractionalDistribution(
          priority,
          20
        );
        if (preview) {
          message += `${priority} (${frequency.toFixed(2)}/month):\n`;
          message += `Sample: ${preview.actualVisits}/${preview.sampleSize} visits `;
          message += `(expected: ${preview.expectedVisits}) - ${preview.accuracy}\n`;

          // Show pattern
          const pattern = preview.distribution
            .slice(0, 10)
            .map((p) => (p.willVisit ? "✓" : "✗"))
            .join("");
          message += `Pattern: ${pattern}...\n\n`;
        }
      }
    });

    if (
      message ===
      "FRACTIONAL FREQUENCY TEST\n\n" +
        `Method: ${CONFIG.FRACTIONAL_VISITS.ROUNDING_METHOD}\n` +
        `Min Frequency: ${CONFIG.FRACTIONAL_VISITS.MIN_FREQUENCY}\n\n`
    ) {
      message +=
        "No fractional frequencies found (all frequencies are 0 or ≥1).";
    }

    SpreadsheetApp.getUi().alert(
      "Fractional Distribution Test",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log(
      "Error testing fractional distribution: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert(
      "Error",
      error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

// NEW: Preview next month's fractional visits
function previewNextMonth() {
  try {
    Utils.log("Previewing next month fractional distribution", "INFO");

    // This would require modifying the seed or date to simulate next month
    const originalSeedMultiplier = CONFIG.FRACTIONAL_VISITS.SEED_MULTIPLIER;
    CONFIG.FRACTIONAL_VISITS.SEED_MULTIPLIER = originalSeedMultiplier + 1000; // Simulate next month

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME
    );
    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const nextMonthStores = storeManager.loadStores(
      utilConfig.includePriorities
    );

    // Restore original seed
    CONFIG.FRACTIONAL_VISITS.SEED_MULTIPLIER = originalSeedMultiplier;

    let message = "NEXT MONTH PREVIEW\n\n";

    if (nextMonthStores.length === 0) {
      message +=
        "No stores would be scheduled next month with current fractional frequencies.";
    } else {
      const byPriority = {};
      nextMonthStores.forEach((store) => {
        if (!byPriority[store.priority]) byPriority[store.priority] = 0;
        byPriority[store.priority]++;
      });

      message += "Stores scheduled for next month:\n";
      Object.entries(byPriority).forEach(([priority, count]) => {
        const frequency = CONFIG.PRIORITIES[priority].requiredVisits;
        message += `${priority}: ${count} stores (${Utils.formatFrequency(
          frequency
        )})\n`;
      });

      message += `\nTotal: ${nextMonthStores.length} stores\n\n`;
      message += "Note: This is a preview based on probability distribution. ";
      message += "Actual results may vary slightly due to randomization.";
    }

    SpreadsheetApp.getUi().alert(
      "Next Month Preview",
      message,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Utils.log("Error previewing next month: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert(
      "Error",
      error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

// ==================== MENU ====================
function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet().addMenu("Route Planner", [
    { name: "📅 Generate Monthly Plan", functionName: "generateMonthlyPlan" },
    null, // Separator
    { name: "📊 Check Utilization", functionName: "checkUtilizationOnly" },
    {
      name: "🔍 Analyze Store Distribution",
      functionName: "analyzeStoreDistribution",
    },
    null, // Separator
    {
      name: "⚡ Test Fractional Distribution",
      functionName: "testFractionalDistribution",
    },
    { name: "🔮 Preview Next Month", functionName: "previewNextMonth" },
  ]);
}
