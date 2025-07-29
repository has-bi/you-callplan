// ==================== MAIN.JS - FINAL VERSION WITH P2 UTILIZATION ====================

function generateEnhancedMonthlyPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
    return;
  }

  try {
    Utils.log(
      "=== STARTING ENHANCED MONTHLY PLAN WITH INTEGRATED POST-PROCESSING ===",
      "INFO"
    );
    ss.toast(
      "Initializing enhanced optimization with auto-cleanup...",
      "Processing",
      -1
    );

    const startTime = new Date();
    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();
    const outputManager = new OutputManager(ss);

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (!stores.length) {
      SpreadsheetApp.getUi().alert("No stores found for selected priorities.");
      return;
    }

    // Run normal optimization
    ss.toast("Running optimization...", "Processing", -1);
    const planResult = routeOptimizer.optimizePlan(stores);

    // ✨ ADD POST-PROCESSING CLEANUP HERE
    ss.toast("Applying post-processing cleanup...", "Processing", -1);
    const cleanupResult = PostProcessingDeduplicator.cleanupFinalRoutes(
      planResult.workingDays
    );

    // Add cleanup stats to result
    planResult.statistics.postProcessingCleanup = {
      duplicatesRemoved: cleanupResult.cleanupStats.duplicatesRemoved,
      storesWithDuplicates: cleanupResult.cleanupStats.storesWithDuplicates,
      finalStoreCount: cleanupResult.cleanupStats.storesKept,
      cleanupActions: cleanupResult.cleanupStats.cleanupActions.length,
    };

    // ✨ ADD DAY CONSOLIDATION HERE
    ss.toast(
      "Consolidating small days and adding P2 stores...",
      "Processing",
      -1
    );
    const consolidationResult = PostProcessingDeduplicator.consolidateSmallDays(
      planResult.workingDays
    );

    // Add consolidation stats to result
    planResult.statistics.dayConsolidation = {
      daysConsolidated: consolidationResult.consolidationCount,
      daysMerged: consolidationResult.mergedDays,
      storesRedistributed: consolidationResult.distributedStores,
      p2StoresAdded: consolidationResult.p2StoresAdded,
      emptyDaysFilled: consolidationResult.emptyDaysFilled,
      daysToppedup: consolidationResult.daysToppedup,
    };

    const endTime = new Date();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    // Create output
    outputManager.createEnhancedSheet(planResult, utilConfig, stores);

    // Show completion message with cleanup and consolidation info
    const stats = planResult.statistics;
    let completionMessage = `✅ ENHANCED OPTIMIZATION COMPLETED in ${processingTime}s!\n\n`;

    // Add cleanup information
    if (stats.postProcessingCleanup) {
      const cleanup = stats.postProcessingCleanup;
      completionMessage += `🧹 AUTO-CLEANUP RESULTS:\n`;
      completionMessage += `• Duplicates removed: ${cleanup.duplicatesRemoved}\n`;
      completionMessage += `• Stores cleaned: ${cleanup.storesWithDuplicates}\n`;
      completionMessage += `• Final store count: ${cleanup.finalStoreCount}\n\n`;
    }

    // Add consolidation information
    if (stats.dayConsolidation) {
      completionMessage += `📦 DAY CONSOLIDATION:\n`;
      completionMessage += `• Days consolidated: ${stats.dayConsolidation.daysConsolidated}\n`;
      completionMessage += `• Days merged: ${
        stats.dayConsolidation.daysMerged || 0
      }\n`;
      completionMessage += `• Stores redistributed: ${
        stats.dayConsolidation.storesRedistributed || 0
      }\n`;

      if (stats.dayConsolidation.p2StoresAdded > 0) {
        completionMessage += `• P2 stores added: ${stats.dayConsolidation.p2StoresAdded}\n`;
        completionMessage += `• Empty days filled: ${
          stats.dayConsolidation.emptyDaysFilled || 0
        }\n`;
        completionMessage += `• Days topped up: ${
          stats.dayConsolidation.daysToppedup || 0
        }\n`;
      }
      completionMessage += "\n";
    }

    if (stats.crossBorderOptimization) {
      const crossBorderStats = stats.crossBorderOptimization;
      completionMessage += `📊 Optimization Results:\n`;
      completionMessage += `• ${crossBorderStats.daysAfter} optimized days\n`;
      completionMessage += `• ${crossBorderStats.avgUtilization} average utilization\n`;
      completionMessage += `• ${crossBorderStats.efficiencyGain} efficiency gain\n`;
      completionMessage += `• ${crossBorderStats.crossBorderDays} cross-border days\n`;
    } else {
      completionMessage += `📊 Optimization Results:\n`;
      completionMessage += `• ${stats.workingDays} working days used\n`;
      completionMessage += `• ${stats.averageStoresPerDay} stores/day average\n`;
      completionMessage += `• ${stats.totalDistance}km total distance\n`;
      completionMessage += `• ${stats.coveragePercentage}% coverage\n`;
    }

    Utils.log(
      "=== ENHANCED OPTIMIZATION WITH CLEANUP AND CONSOLIDATION COMPLETED ===",
      "INFO"
    );
    ss.toast(completionMessage, "✅ Success", 12);
  } catch (error) {
    Utils.log(
      "Error during enhanced plan generation: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert(
      "Enhanced optimization failed: " + error.toString()
    );
  }
}

function generateBasicMonthlyPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Callplan MY" not found!');
    return;
  }

  try {
    Utils.log("=== STARTING BASIC MONTHLY PLAN WITH FIXES ===", "INFO");
    ss.toast("Initializing basic optimization with fixes...", "Processing", -1);

    const storeManager = new StoreManager(sheet);
    const utilManager = new UtilizationManager(sheet);
    const routeOptimizer = new RouteOptimizer();
    const outputManager = new OutputManager(ss);

    // Force basic optimization with fixes
    routeOptimizer.useEnhancedOptimization = false;

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (!stores.length) {
      SpreadsheetApp.getUi().alert("No stores found for selected priorities.");
      return;
    }

    const startTime = new Date();
    const planResult = routeOptimizer.optimizePlan(stores);

    // Apply cleanup and consolidation for basic plan too
    const cleanupResult = PostProcessingDeduplicator.cleanupFinalRoutes(
      planResult.workingDays
    );
    const consolidationResult = PostProcessingDeduplicator.consolidateSmallDays(
      planResult.workingDays
    );

    const endTime = new Date();
    const processingTime = ((endTime - startTime) / 1000).toFixed(1);

    outputManager.createSheet(planResult, utilConfig, stores);

    const stats = planResult.statistics;
    let completionMessage = `✅ BASIC OPTIMIZATION COMPLETED in ${processingTime}s!\n\n`;
    completionMessage += `📊 Results:\n`;
    completionMessage += `• ${stats.totalStoresPlanned}/${stats.totalStoresRequired} stores planned (${stats.coveragePercentage}%)\n`;
    completionMessage += `• ${stats.workingDays} working days used\n`;
    completionMessage += `• ${stats.averageStoresPerDay} stores/day average\n`;
    completionMessage += `• ${stats.totalDistance}km total distance\n`;

    if (cleanupResult.cleanupStats.duplicatesRemoved > 0) {
      completionMessage += `• ${cleanupResult.cleanupStats.duplicatesRemoved} duplicates removed\n`;
    }
    if (consolidationResult.consolidationCount > 0) {
      completionMessage += `• ${consolidationResult.consolidationCount} small days consolidated\n`;
    }
    if (consolidationResult.p2StoresAdded > 0) {
      completionMessage += `• ${consolidationResult.p2StoresAdded} P2 stores added`;
    }

    Utils.log("=== BASIC OPTIMIZATION COMPLETED ===", "INFO");
    ss.toast(completionMessage, "✅ Success", 10);
  } catch (error) {
    Utils.log(
      "Error during basic plan generation: " + error.toString(),
      "ERROR"
    );
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
  }
}

// Test function for problem fixes
function testRouteProblemFixes() {
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
    const stores = storeManager.loadStores(utilConfig.includePriorities);

    if (stores.length < 5) {
      SpreadsheetApp.getUi().alert("Need at least 5 stores to test fixes.");
      return;
    }

    // Test with fixes
    routeOptimizer.useEnhancedOptimization = false; // Use basic with fixes
    const planResult = routeOptimizer.optimizePlan(stores);

    // Apply post-processing
    const cleanupResult = PostProcessingDeduplicator.cleanupFinalRoutes(
      planResult.workingDays
    );
    const consolidationResult = PostProcessingDeduplicator.consolidateSmallDays(
      planResult.workingDays
    );

    // Analyze problems
    const analyzer = new RouteProblemAnalyzer();
    const problems = analyzer.analyzeRouteProblems(planResult);
    const total = problems.duplicates + problems.gaps + problems.timeViolations;

    let message = "🔧 PROBLEM FIX TEST RESULTS\n\n";
    message += `Total Problems: ${total}\n`;
    message += `• Duplicate Visits: ${problems.duplicates}\n`;
    message += `• Gap Violations: ${problems.gaps}\n`;
    message += `• Time Violations: ${problems.timeViolations}\n\n`;

    message += `Post-Processing Results:\n`;
    message += `• Duplicates cleaned: ${cleanupResult.cleanupStats.duplicatesRemoved}\n`;
    message += `• Days consolidated: ${consolidationResult.consolidationCount}\n`;
    message += `• P2 stores added: ${
      consolidationResult.p2StoresAdded || 0
    }\n\n`;

    if (total === 0) {
      message += "✅ All problems fixed successfully!";
    } else {
      message += "❌ Some problems remain. Check logs for details.";
    }

    SpreadsheetApp.getUi().alert("Problem Fix Test", message);
  } catch (error) {
    Utils.log("Error testing fixes: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert("Test failed: " + error.toString());
  }
}

function checkUtilizationOnly() {
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

    storeManager.updateVisitFrequencies();
    const utilConfig = utilManager.getConfig();
    const storeStats = storeManager.getStoreStatistics(
      utilConfig.includePriorities
    );

    let message = "📊 UTILIZATION ANALYSIS\n\n";
    message += `Selected Priorities: ${utilConfig.includePriorities.join(
      ", "
    )}\n`;
    message += `Current Utilization: ${utilConfig.utilization.toFixed(1)}%\n\n`;

    message += "📈 Store Statistics:\n";
    Object.entries(storeStats.byPriority).forEach(([priority, stats]) => {
      message += `${priority}: ${stats.scheduledStores}/${stats.totalStores} stores `;
      message += `(${Utils.formatFrequency(stats.frequency)})\n`;
    });

    message += `\nTotal: ${storeStats.totals.scheduledStores} stores scheduled for this month\n`;

    if (utilConfig.utilization > 100) {
      message += "\n⚠️ WARNING: Over 100% utilization!";
    } else if (utilConfig.utilization < 70) {
      message += "\n💡 LOW UTILIZATION: Consider adding more priorities.";
    } else {
      message += "\n✅ Utilization looks good.";
    }

    SpreadsheetApp.getUi().alert("Utilization Check", message);
  } catch (error) {
    Utils.log("Error checking utilization: " + error.toString(), "ERROR");
    SpreadsheetApp.getUi().alert("Error: " + error.toString());
  }
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("🚀 Route Optimizer - Complete")
    .addItem("📅 Generate Enhanced Monthly Plan", "generateEnhancedMonthlyPlan")
    .addItem("📅 Generate Basic Monthly Plan", "generateBasicMonthlyPlan")
    .addSeparator()
    .addItem("📊 Check Utilization", "checkUtilizationOnly")
    .addItem("🔧 Test Problem Fixes", "testRouteProblemFixes")
    .addToUi();

  Utils.log("Route Optimizer with complete fixes menu created", "INFO");
}
