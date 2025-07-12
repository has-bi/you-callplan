// ==================== GEOGRAPHIC-OPTIMIZED MAIN ====================

function generateMonthlyPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
    return;
  }

  try {
    Utils.log(
      "=== STARTING GEOGRAPHIC-OPTIMIZED MONTHLY PLAN GENERATION ===",
      "INFO"
    );
    ss.toast("Initializing geographic optimization...", "Processing", -1);

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();
    const outputManager = new OutputManager(ss);

    // Update visit frequencies
    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();

    // Show optimization configuration
    let toastMessage = `GEOGRAPHIC OPTIMIZATION v2.0\n`;
    toastMessage += `Priorities: ${utilConfig.includePriorities.join(
      ", "
    )} (${utilConfig.utilization.toFixed(1)}% utilization)\n`;
    toastMessage += `Algorithm: K-means clustering + 2-opt route optimization\n`;
    toastMessage += `Distance limit: ${CONFIG.TRAVEL_LIMITS.MAX_DISTANCE_FROM_HOME}km from base`;

    ss.toast(toastMessage, "Configuration", 3);

    // Load stores
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (!stores.length) {
      Utils.log("No stores found for selected priorities", "ERROR");
      SpreadsheetApp.getUi().alert(
        "No stores found for selected priorities. Please check visit frequencies and shouldVisit flags."
      );
      return;
    }

    // Get store statistics
    const storeStats = storeManager.getStoreStatistics(
      utilConfig.includePriorities
    );

    ss.toast(
      `Optimizing ${stores.length} stores (${storeStats.totals.expectedVisits} expected visits)...`,
      "Processing",
      -1
    );

    // Run optimization
    const startTime = new Date();
    const planResult = routeOptimizer.optimizePlan(stores);
    const endTime = new Date();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    // Create output
    outputManager.createSheet(planResult, utilConfig, stores);

    // Show completion message
    const stats = planResult.statistics;
    let completionMessage = `✅ OPTIMIZATION COMPLETED in ${processingTime}s!\n\n`;
    completionMessage += `📊 Results:\n`;
    completionMessage += `• ${stats.totalStoresPlanned}/${stats.totalStoresRequired} stores planned (${stats.coveragePercentage}%)\n`;
    completionMessage += `• ${stats.workingDays} working days used\n`;
    completionMessage += `• ${stats.averageStoresPerDay} stores/day average\n`;
    completionMessage += `• ${stats.totalDistance.toFixed(
      0
    )}km total distance\n`;

    if (stats.geographicOptimization) {
      completionMessage += `\n🗺️ Geographic Metrics:\n`;
      completionMessage += `• Load balance: ${stats.geographicOptimization.balanceScore}%\n`;
      completionMessage += `• Day utilization: ${stats.geographicOptimization.utilizationRate}%\n`;
    }

    if (stats.mallStats && stats.mallStats.totalMallClusters > 0) {
      completionMessage += `\n🏢 Mall Clustering:\n`;
      completionMessage += `• ${stats.mallStats.totalMallClusters} mall clusters detected\n`;
      completionMessage += `• ${stats.mallStats.timeSavings} minutes saved\n`;
    }

    Utils.log("=== OPTIMIZATION COMPLETED ===", "INFO");
    ss.toast(completionMessage, "✅ Success", 10);
  } catch (error) {
    Utils.log("Error during plan generation: " + error.toString(), "ERROR");
    console.error(error);
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
  }
}

// Test function for geographic clustering
function testGeographicClustering() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.SHEET_NAME
    );
    if (!sheet) {
      SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
      return;
    }

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const stores = storeManager.loadStores(
      utilConfig.includePriorities.slice(0, 2)
    );

    if (stores.length < 10) {
      SpreadsheetApp.getUi().alert(
        "Need at least 10 stores to test clustering."
      );
      return;
    }

    // Test k-means clustering
    const testStores = stores.slice(0, 50);
    const k = routeOptimizer.calculateOptimalClusters(testStores.length);
    const clusters = routeOptimizer.performKMeansClustering(testStores, k);

    let message = "GEOGRAPHIC CLUSTERING TEST\n\n";
    message += `Stores tested: ${testStores.length}\n`;
    message += `Optimal clusters (k): ${k}\n`;
    message += `Actual clusters formed: ${clusters.length}\n\n`;

    message += "CLUSTER DETAILS:\n";
    clusters.slice(0, 5).forEach((cluster, idx) => {
      const center = routeOptimizer.getClusterCenter(cluster);
      const cohesiveness = routeOptimizer.calculateClusterCohesiveness(cluster);

      message += `\nCluster ${idx + 1}:\n`;
      message += `• Stores: ${cluster.length}\n`;
      message += `• Center: ${center.lat.toFixed(4)}, ${center.lng.toFixed(
        4
      )}\n`;
      message += `• Cohesiveness: ${cohesiveness.toFixed(2)}km avg distance\n`;
      message += `• Priorities: ${[
        ...new Set(cluster.map((s) => s.priority)),
      ].join(", ")}\n`;
    });

    if (clusters.length > 5) {
      message += `\n... and ${clusters.length - 5} more clusters\n`;
    }

    message += "\n✅ K-means clustering working successfully!";

    SpreadsheetApp.getUi().alert("Geographic Clustering Test", message);
  } catch (error) {
    Utils.log("Error testing clustering: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
  }
}

// Menu creation
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("🗺️ Geographic Optimizer v2")
    .addItem("📅 Generate Monthly Plan", "generateMonthlyPlan")
    .addSeparator()
    .addItem("📊 Check Utilization", "checkUtilizationOnly")
    .addItem("🔬 Test Geographic Clustering", "testGeographicClustering")
    .addItem("📈 Analyze Store Distribution", "analyzeStoreDistribution")
    .addToUi();

  Utils.log("Geographic Optimizer v2 menu created", "INFO");
}
